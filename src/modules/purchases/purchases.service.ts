import { PurchaseInvoiceDetailResponseDto } from './dto/response/purchase-invoice-response.dto';
import { toSupplierResponseDto } from '../suppliers/utils/supplier-response.util';
import { toItemResponseDto } from '../items/utils/item-response.util';
import { validateLineValues } from '../../shared/utils/volume/validate-line-values.util';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { PaymentMethod } from '../../shared/enums/payment-method.enum';
import { PricingMode } from '../../shared/enums/pricing-mode.enum';
import { resolveLinePricingMode } from '../../shared/utils/volume/line-pricing-mode.util';
import { PurchaseInvoiceStatus } from '../../shared/enums/purchase-invoice-status.enum';
import { cairoCustomRange, cairoPeriodRange, cairoYearNow } from '../../shared/utils/period/cairo-period.util';
import { roundMoney } from '../../shared/utils/round-money/round-money.util';
import { lineTotalForPricing, stockDeltaForLine } from '../../shared/utils/volume/cubic-meter.util';
import { AuditService } from '../audit/audit.service';
import { Item, ItemDocument } from '../items/schemas/item.schema';
import { InvoiceCounter, InvoiceCounterDocument } from '../sales-invoices/schemas/invoice-counter.schema';
import { SupplierPayment, SupplierPaymentDocument } from '../supplier-payments/schemas/supplier-payment.schema';
import { Supplier, SupplierDocument } from '../suppliers/schemas/supplier.schema';
import { CreatePurchaseInvoiceDto, CreatePurchaseInvoiceLineDto } from './dto/request/create-purchase-invoice.dto';
import { ListPurchaseInvoicesQueryDto } from './dto/request/list-purchase-invoices-query.dto';
import { UpdatePurchaseInvoiceDto } from './dto/request/update-purchase-invoice.dto';
import {
  PurchaseInvoiceListResponseDto,
  PurchaseInvoiceResponseDto,
} from './dto/response/purchase-invoice-response.dto';
import { PurchaseInvoice, PurchaseInvoiceDocument } from './schemas/purchase-invoice.schema';
import { BuiltPurchaseLine } from './types/built-purchase-line.type';
import { PurchaseInvoiceListFilter } from './types/purchase-invoice-list-filter.type';

@Injectable()
export class PurchasesService {
  constructor(
    @InjectModel(PurchaseInvoice.name)
    private readonly purchaseInvoiceModel: Model<PurchaseInvoiceDocument>,
    @InjectModel(InvoiceCounter.name)
    private readonly invoiceCounterModel: Model<InvoiceCounterDocument>,
    @InjectModel(Supplier.name)
    private readonly supplierModel: Model<SupplierDocument>,
    @InjectModel(Item.name)
    private readonly itemModel: Model<ItemDocument>,
    @InjectModel(SupplierPayment.name)
    private readonly supplierPaymentModel: Model<SupplierPaymentDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly auditService: AuditService,
  ) {}

  public async create(dto: CreatePurchaseInvoiceDto, user: AuthUser): Promise<PurchaseInvoiceResponseDto> {
    if (!dto.lines?.length) {
      throw new BadRequestException('Purchase invoice must have at least one line');
    }

    const supplier = await this.supplierModel.findOne({ _id: dto.supplierId, isDeleted: false }).exec();
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }
    if (!supplier.isActive) {
      throw new BadRequestException('Supplier is inactive');
    }

    const itemIds = [...new Set(dto.lines.map((line) => line.itemId))];
    const items = await this.itemModel.find({ _id: { $in: itemIds }, isDeleted: false }).exec();

    if (items.length !== itemIds.length) {
      throw new NotFoundException('One or more items were not found');
    }

    const itemById = new Map(items.map((item) => [item._id.toString(), item]));
    for (const item of items) {
      if (!item.isActive) {
        throw new BadRequestException(`Item is inactive: ${item.name}`);
      }
    }

    const builtLines = dto.lines.map((lineDto) => this.buildLine(lineDto, itemById.get(lineDto.itemId)!));
    const total = roundMoney(builtLines.reduce((sum, row) => sum + row.line.lineTotal, 0));
    if (!Number.isFinite(total)) throw new BadRequestException('Invoice total must be finite');
    const paid = roundMoney(dto.paid ?? 0);
    if (dto.accountPaymentAmount !== undefined && dto.existingDebtPayment !== undefined) {
      throw new BadRequestException('Supply accountPaymentAmount or existingDebtPayment, not both');
    }
    const existingDebtPayment = dto.accountPaymentAmount ?? dto.existingDebtPayment ?? 0;
    if (
      dto.accountPaymentAmount === null ||
      dto.existingDebtPayment === null ||
      !Number.isFinite(existingDebtPayment) ||
      existingDebtPayment !== roundMoney(existingDebtPayment)
    ) {
      throw new BadRequestException('Account payment must be a finite amount with at most 2 decimal places');
    }

    if (paid < 0) {
      throw new BadRequestException('Paid amount cannot be negative');
    }
    if (paid > total) {
      throw new BadRequestException('Paid amount cannot exceed total');
    }
    if (existingDebtPayment < 0) {
      throw new BadRequestException('Existing debt payment cannot be negative');
    }

    const remaining = roundMoney(total - paid);

    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const lockedSupplier = await this.supplierModel
        .findOne({ _id: dto.supplierId, isDeleted: false })
        .session(session)
        .exec();

      if (!lockedSupplier) {
        throw new NotFoundException('Supplier not found');
      }
      if (!lockedSupplier.isActive) {
        throw new BadRequestException('Supplier is inactive');
      }

      const invoiceNumber = await this.nextInvoiceNumber(session);

      const [created] = await this.purchaseInvoiceModel.create(
        [
          {
            invoiceNumber,
            supplierId: lockedSupplier._id,
            lines: builtLines.map((row) => row.line),
            total,
            paid,
            remaining,
            status: PurchaseInvoiceStatus.SAVED,
            notes: dto.notes?.trim() || null,
            createdBy: new Types.ObjectId(user.id),
          },
        ],
        { session },
      );

      // Stock increment: Buying goods increases stock
      for (const row of builtLines) {
        if (row.stockDelta === 0) continue;
        await this.itemModel.updateOne({ _id: row.itemId }, { $inc: { stockQuantity: row.stockDelta } }, { session });
      }

      // Debt increment: Unpaid amount (remaining) increases what the shop owes the supplier
      const oldAmountOwed = lockedSupplier.amountOwed;
      if (remaining > 0 || existingDebtPayment > 0) {
        lockedSupplier.amountOwed = roundMoney(lockedSupplier.amountOwed + remaining - existingDebtPayment);
        await lockedSupplier.save({ session });
      }

      if (paid > 0) {
        await this.supplierPaymentModel.create(
          [
            {
              supplierId: lockedSupplier._id,
              purchaseInvoiceId: created._id,
              amount: paid,
              method: PaymentMethod.CASH,
              notes: dto.notes ? dto.notes.trim() : null,
              recordedBy: new Types.ObjectId(user.id),
              reversedAt: null,
              reversedBy: null,
            },
          ],
          { session },
        );
      }

      if (existingDebtPayment > 0) {
        const [debtPayment] = await this.supplierPaymentModel.create(
          [
            {
              supplierId: lockedSupplier._id,
              purchaseInvoiceId: null,
              sourcePurchaseInvoiceId: created._id,
              amount: existingDebtPayment,
              method: PaymentMethod.CASH,
              notes: dto.notes?.trim() || null,
              recordedBy: new Types.ObjectId(user.id),
              reversedAt: null,
              reversedBy: null,
            },
          ],
          { session },
        );
        await this.auditService.log(
          {
            userId: user.id,
            action: 'supplier_payment_recorded',
            entityType: 'SupplierPayment',
            entityId: debtPayment._id.toString(),
            changes: {
              supplierId: { old: null, new: lockedSupplier.name },
              sourcePurchaseInvoiceId: { old: null, new: created._id.toString() },
              amount: { old: null, new: existingDebtPayment },
              method: { old: null, new: debtPayment.method },
              amountOwed: { old: roundMoney(oldAmountOwed + remaining), new: lockedSupplier.amountOwed },
            },
            refCollection: null,
            refId: null,
            summary: `Payment of ${existingDebtPayment} EGP recorded for supplier: ${lockedSupplier.name}`,
          },
          session,
        );
      }

      await this.auditService.log(
        {
          userId: user.id,
          action: 'purchase_created',
          entityType: 'PurchaseInvoice',
          entityId: created._id.toString(),
          changes: {
            invoiceNumber: { old: null, new: created.invoiceNumber },
            supplierId: { old: null, new: lockedSupplier.name },
            total: { old: null, new: created.total },
            paid: { old: null, new: created.paid },
            existingDebtPayment: { old: null, new: existingDebtPayment },
            remaining: { old: null, new: created.remaining },
            status: { old: null, new: created.status },
            amountOwed: { old: oldAmountOwed, new: lockedSupplier.amountOwed },
          },
          refCollection: null,
          refId: null,
          summary: `Purchase invoice created: ${created.invoiceNumber} for supplier: ${lockedSupplier.name}`,
        },
        session,
      );

      const response = await this.toResponseWithAccountPayment(created, session);
      await session.commitTransaction();
      return response;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  public async findAll(query: ListPurchaseInvoicesQueryDto): Promise<PurchaseInvoiceListResponseDto> {
    if (query.period !== undefined && !query.date) {
      throw new BadRequestException('date is required when period is set');
    }
    if (query.date && query.period === undefined) {
      throw new BadRequestException('period is required when date is set');
    }

    const filter = await this.buildListFilter(query);
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 100);
    const skip = (page - 1) * limit;

    const activeFilter = { ...filter, status: PurchaseInvoiceStatus.SAVED };

    const [docs, total, summaryAgg] = await Promise.all([
      this.purchaseInvoiceModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.purchaseInvoiceModel.countDocuments(filter).exec(),
      this.purchaseInvoiceModel.aggregate<{ totalAmount: number }>([
        { $match: activeFilter },
        { $group: { _id: null, totalAmount: { $sum: '$total' } } },
      ]),
    ]);

    const totalAmount = summaryAgg.length > 0 ? roundMoney(summaryAgg[0].totalAmount) : 0;
    const [accountPayments, supplierNames] = await Promise.all([
      this.accountPaymentAmounts(docs),
      this.supplierNamesForRows(docs),
    ]);

    return {
      items: docs.map((doc) => ({
        ...this.toResponseDto(doc, accountPayments.get(doc._id.toString()) ?? 0),
        supplierName: supplierNames.get(doc.supplierId.toString()) ?? null,
      })),
      meta: {
        page,
        limit,
        total,
      },
      summary: {
        totalAmount,
      },
    };
  }

  public async findOne(id: string): Promise<PurchaseInvoiceDetailResponseDto> {
    const invoice = await this.purchaseInvoiceModel.findById(id).exec();
    if (!invoice) {
      throw new NotFoundException('Purchase invoice not found');
    }
    const itemIds = [...new Set(invoice.lines.map((line) => line.itemId.toString()))];
    const [response, supplier, items] = await Promise.all([
      this.toResponseWithAccountPayment(invoice),
      invoice.supplierId
        ? this.supplierModel.findOne({ _id: invoice.supplierId, isDeleted: false }).exec()
        : Promise.resolve(null),
      itemIds.length > 0
        ? this.itemModel
            .find({ _id: { $in: itemIds.map((itemId) => new Types.ObjectId(itemId)) }, isDeleted: false })
            .populate('categoryId', 'name createdAt')
            .exec()
        : Promise.resolve([]),
    ]);
    return {
      ...response,
      supplier: supplier ? toSupplierResponseDto(supplier) : null,
      items: items.map(toItemResponseDto),
    };
  }

  public async update(id: string, dto: UpdatePurchaseInvoiceDto, user: AuthUser): Promise<PurchaseInvoiceResponseDto> {
    const current = await this.purchaseInvoiceModel.findById(id).exec();
    if (!current) throw new NotFoundException('Purchase invoice not found');
    if (current.status !== PurchaseInvoiceStatus.SAVED) {
      throw new BadRequestException('Only saved purchase invoices can be edited');
    }
    if (!dto.lines?.length) throw new BadRequestException('Purchase invoice must have at least one line');

    const itemIds = [...new Set(dto.lines.map((line) => line.itemId))];
    const items = await this.itemModel.find({ _id: { $in: itemIds }, isDeleted: false }).exec();
    if (items.length !== itemIds.length) throw new NotFoundException('One or more items were not found');
    const originalItemIds = new Set(current.lines.map((line) => line.itemId.toString()));
    const itemById = new Map(items.map((item) => [item._id.toString(), item]));
    for (const item of items) {
      if (!item.isActive && !originalItemIds.has(item._id.toString())) {
        throw new BadRequestException(`Item is inactive: ${item.name}`);
      }
    }
    const targetSupplier = await this.supplierModel.findOne({ _id: dto.supplierId, isDeleted: false }).exec();
    if (!targetSupplier) throw new NotFoundException('Supplier not found');
    if (!targetSupplier.isActive && dto.supplierId !== current.supplierId.toString()) {
      throw new BadRequestException('Supplier is inactive');
    }
    const builtLines = dto.lines.map((line) => this.buildLine(line, itemById.get(line.itemId)!));
    const total = roundMoney(builtLines.reduce((sum, row) => sum + row.line.lineTotal, 0));
    if (!Number.isFinite(total)) throw new BadRequestException('Invoice total must be finite');
    const paid = roundMoney(dto.paid);
    if (!Number.isFinite(paid) || paid < 0 || paid > total) {
      throw new BadRequestException('Paid amount must be between zero and invoice total');
    }
    const accountPaymentAmount = dto.accountPaymentAmount ?? 0;
    if (
      dto.accountPaymentAmount === null ||
      !Number.isFinite(accountPaymentAmount) ||
      accountPaymentAmount < 0 ||
      accountPaymentAmount !== roundMoney(accountPaymentAmount)
    ) {
      throw new BadRequestException('Account payment must be a nonnegative amount with at most 2 decimal places');
    }
    const remaining = roundMoney(total - paid);
    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const invoice = await this.purchaseInvoiceModel.findById(id).session(session).exec();
      if (!invoice) throw new NotFoundException('Purchase invoice not found');
      if (invoice.status !== PurchaseInvoiceStatus.SAVED) {
        throw new BadRequestException('Only saved purchase invoices can be edited');
      }
      const oldSupplierId = invoice.supplierId.toString();
      const oldItemIds = new Set(invoice.lines.map((line) => line.itemId.toString()));
      for (const item of items) {
        if (!item.isActive && !oldItemIds.has(item._id.toString())) {
          throw new BadRequestException(`Item is inactive: ${item.name}`);
        }
      }
      const supplier = await this.supplierModel.findById(dto.supplierId).session(session).exec();
      if (!supplier || supplier.isDeleted) throw new NotFoundException('Supplier not found');
      if (!supplier.isActive && dto.supplierId !== oldSupplierId) {
        throw new BadRequestException('Supplier is inactive');
      }
      const oldSupplier =
        oldSupplierId === dto.supplierId
          ? supplier
          : await this.supplierModel.findById(oldSupplierId).session(session).exec();
      if (!oldSupplier || oldSupplier.isDeleted) throw new NotFoundException('Original supplier not found');

      for (const line of invoice.lines) {
        const delta = stockDeltaForLine({
          pricingMode: resolveLinePricingMode(line),
          quantity: line.quantity,
          thicknessM: line.thickness,
          widthM: line.width,
          lengthM: line.length,
        });
        if (delta === 0) continue;
        await this.itemModel.updateOne({ _id: line.itemId }, { $inc: { stockQuantity: -delta } }, { session });
      }
      for (const row of builtLines) {
        if (row.stockDelta === 0) continue;
        await this.itemModel.updateOne({ _id: row.itemId }, { $inc: { stockQuantity: row.stockDelta } }, { session });
      }

      const oldRemaining = invoice.remaining;
      if (oldSupplierId === dto.supplierId) {
        supplier.amountOwed = roundMoney(supplier.amountOwed + remaining - oldRemaining);
        await supplier.save({ session });
      } else {
        oldSupplier.amountOwed = roundMoney(oldSupplier.amountOwed - oldRemaining);
        supplier.amountOwed = roundMoney(supplier.amountOwed + remaining);
        await oldSupplier.save({ session });
        await supplier.save({ session });
      }

      const linkedPayment = await this.supplierPaymentModel
        .findOne({
          purchaseInvoiceId: invoice._id,
          reversedAt: null,
        })
        .session(session)
        .exec();
      if (paid > 0 && linkedPayment) {
        linkedPayment.amount = paid;
        linkedPayment.supplierId = supplier._id;
        linkedPayment.notes = dto.notes?.trim() || null;
        await linkedPayment.save({ session });
      } else if (paid > 0) {
        await this.supplierPaymentModel.create(
          [
            {
              supplierId: supplier._id,
              purchaseInvoiceId: invoice._id,
              amount: paid,
              method: PaymentMethod.CASH,
              notes: dto.notes?.trim() || null,
              recordedBy: new Types.ObjectId(user.id),
              reversedAt: null,
              reversedBy: null,
            },
          ],
          { session },
        );
      } else if (linkedPayment) {
        linkedPayment.reversedAt = new Date();
        linkedPayment.reversedBy = new Types.ObjectId(user.id);
        await linkedPayment.save({ session });
      }

      if (accountPaymentAmount > 0) {
        if (!supplier.isActive) throw new BadRequestException('Supplier is inactive');
        const oldAmountOwed = supplier.amountOwed;
        supplier.amountOwed = roundMoney(oldAmountOwed - accountPaymentAmount);
        await supplier.save({ session });
        const [payment] = await this.supplierPaymentModel.create(
          [
            {
              supplierId: supplier._id,
              purchaseInvoiceId: null,
              sourcePurchaseInvoiceId: invoice._id,
              amount: accountPaymentAmount,
              method: PaymentMethod.CASH,
              notes: dto.notes?.trim() || null,
              recordedBy: new Types.ObjectId(user.id),
              reversedAt: null,
              reversedBy: null,
            },
          ],
          { session },
        );
        await this.auditService.log(
          {
            userId: user.id,
            action: 'supplier_payment_recorded',
            entityType: 'SupplierPayment',
            entityId: payment._id.toString(),
            changes: {
              supplierId: { old: null, new: supplier.name },
              sourcePurchaseInvoiceId: { old: null, new: invoice._id.toString() },
              amount: { old: null, new: accountPaymentAmount },
              method: { old: null, new: payment.method },
              amountOwed: { old: oldAmountOwed, new: supplier.amountOwed },
            },
            refCollection: null,
            refId: null,
            summary: `Payment of ${accountPaymentAmount} EGP recorded for supplier: ${supplier.name}`,
          },
          session,
        );
      }
      const oldTotal = invoice.total;
      const oldPaid = invoice.paid;
      const oldNotes = invoice.notes;
      const oldLineCount = invoice.lines.length;
      invoice.supplierId = supplier._id;
      invoice.lines = builtLines.map((row) => row.line);
      invoice.total = total;
      invoice.paid = paid;
      invoice.remaining = remaining;
      invoice.notes = dto.notes?.trim() || null;
      await invoice.save({ session });
      await this.auditService.log(
        {
          userId: user.id,
          action: 'purchase_updated',
          entityType: 'PurchaseInvoice',
          entityId: invoice._id.toString(),
          changes: {
            supplierId: { old: oldSupplier.name, new: supplier.name },
            total: { old: oldTotal, new: total },
            paid: { old: oldPaid, new: paid },
            remaining: { old: oldRemaining, new: remaining },
            notes: { old: oldNotes, new: invoice.notes },
            lines: { old: oldLineCount, new: invoice.lines.length },
          },
          refCollection: null,
          refId: null,
          summary: `Purchase invoice updated: ${invoice.invoiceNumber}`,
        },
        session,
      );
      const response = await this.toResponseWithAccountPayment(invoice, session);
      await session.commitTransaction();
      return response;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  public async cancel(id: string, user: AuthUser): Promise<PurchaseInvoiceResponseDto> {
    const invoice = await this.purchaseInvoiceModel.findById(id).exec();
    if (!invoice) {
      throw new NotFoundException('Purchase invoice not found');
    }
    if (invoice.status !== PurchaseInvoiceStatus.SAVED) {
      throw new BadRequestException('Only saved purchase invoices can be cancelled');
    }

    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const lockedInvoice = await this.purchaseInvoiceModel.findById(id).session(session).exec();
      if (!lockedInvoice) {
        throw new NotFoundException('Purchase invoice not found');
      }
      if (lockedInvoice.status !== PurchaseInvoiceStatus.SAVED) {
        throw new BadRequestException('Only saved purchase invoices can be cancelled');
      }

      const itemIds = lockedInvoice.lines.map((line) => line.itemId);
      const items = await this.itemModel
        .find({ _id: { $in: itemIds } })
        .session(session)
        .exec();
      const itemById = new Map(items.map((item) => [item._id.toString(), item]));

      // Stock reversal: Cancelling a purchase reverses the received stock (deducts stock)
      for (const line of lockedInvoice.lines) {
        const item = itemById.get(line.itemId.toString());
        if (!item) {
          throw new NotFoundException(`Item not found for line: ${line.itemId.toString()}`);
        }

        const stockDelta = stockDeltaForLine({
          pricingMode: resolveLinePricingMode(line),
          quantity: line.quantity,
          thicknessM: line.thickness,
          widthM: line.width,
          lengthM: line.length,
        });

        if (stockDelta === 0) continue;
        await this.itemModel.updateOne({ _id: line.itemId }, { $inc: { stockQuantity: -stockDelta } }, { session });
      }

      // Debt reversal: Subtract invoice remaining from supplier amountOwed
      const supplier = await this.supplierModel.findById(lockedInvoice.supplierId).session(session).exec();
      if (!supplier) {
        throw new NotFoundException('Supplier not found');
      }

      const oldAmountOwed = supplier.amountOwed;
      const newAmountOwed = roundMoney(supplier.amountOwed - lockedInvoice.remaining);
      supplier.amountOwed = newAmountOwed;
      await supplier.save({ session });

      const now = new Date();
      await this.supplierPaymentModel.updateMany(
        {
          purchaseInvoiceId: lockedInvoice._id,
          reversedAt: null,
        },
        {
          $set: {
            reversedAt: now,
            reversedBy: new Types.ObjectId(user.id),
          },
        },
        { session },
      );

      const oldStatus = lockedInvoice.status;
      lockedInvoice.status = PurchaseInvoiceStatus.CANCELLED;
      await lockedInvoice.save({ session });

      await this.auditService.log(
        {
          userId: user.id,
          action: 'purchase_cancelled',
          entityType: 'PurchaseInvoice',
          entityId: lockedInvoice._id.toString(),
          changes: {
            status: { old: oldStatus, new: PurchaseInvoiceStatus.CANCELLED },
            remainingReversed: { old: lockedInvoice.remaining, new: 0 },
            amountOwed: { old: oldAmountOwed, new: newAmountOwed },
          },
          refCollection: null,
          refId: null,
          summary: `Purchase invoice cancelled: ${lockedInvoice.invoiceNumber}`,
        },
        session,
      );

      const response = await this.toResponseWithAccountPayment(lockedInvoice, session);
      await session.commitTransaction();
      return response;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // ----------------- Helper Methods -----------------

  private buildLine(lineDto: CreatePurchaseInvoiceLineDto, item: ItemDocument): BuiltPurchaseLine {
    if (
      !Number.isFinite(lineDto.unitCost) ||
      lineDto.unitCost <= 0 ||
      lineDto.unitCost !== roundMoney(lineDto.unitCost)
    ) {
      throw new BadRequestException('unitCost must be positive with at most 2 decimal places');
    }
    if (lineDto.quantity <= 0) {
      throw new BadRequestException('quantity must be greater than 0');
    }

    const isFreeAmount = item.pricingMode === PricingMode.FREE_AMOUNT;
    if (
      isFreeAmount &&
      (lineDto.quantity !== 1 ||
        lineDto.thickness !== undefined ||
        lineDto.width !== undefined ||
        lineDto.length !== undefined)
    ) {
      throw new BadRequestException('Free-amount lines require quantity 1 and no dimensions');
    }
    const isCubic = item.pricingMode === PricingMode.PER_CUBIC_METER;
    if (isCubic) {
      if (lineDto.thickness === undefined || lineDto.width === undefined || lineDto.length === undefined) {
        throw new BadRequestException(`Dimensions are required for cubic-meter item: ${item.name}`);
      }
      if (lineDto.thickness <= 0 || lineDto.width <= 0 || lineDto.length <= 0) {
        throw new BadRequestException(`Dimensions must be greater than 0 for item: ${item.name}`);
      }
    }

    const thickness = lineDto.thickness ?? null;
    const width = lineDto.width ?? null;
    const length = lineDto.length ?? null;
    for (const dimension of [thickness, width, length]) {
      if (dimension != null && (!Number.isFinite(dimension) || dimension <= 0)) {
        throw new BadRequestException('Dimensions must be positive finite meter values');
      }
    }

    const unitCost = roundMoney(lineDto.unitCost);
    const lineTotal = roundMoney(
      lineTotalForPricing({
        pricingMode: item.pricingMode,
        quantity: lineDto.quantity,
        piecePrice: unitCost,
        thicknessM: thickness,
        widthM: width,
        lengthM: length,
      }),
    );

    const stockDelta = stockDeltaForLine({
      pricingMode: item.pricingMode,
      quantity: lineDto.quantity,
      thicknessM: thickness,
      widthM: width,
      lengthM: length,
    });

    validateLineValues({ isCubic, isFreeAmount, thickness, width, length, stockDelta, lineTotal });

    const note = lineDto.note !== undefined && lineDto.note.trim() !== '' ? lineDto.note.trim() : null;

    return {
      itemId: item._id.toString(),
      stockDelta,
      line: {
        itemId: item._id,
        quantity: lineDto.quantity,
        width,
        pricingModeSnapshot: item.pricingMode,
        length,
        thickness,
        unitCost,
        lineTotal,
        note,
      },
    };
  }

  private async nextInvoiceNumber(session: ClientSession): Promise<string> {
    const year = cairoYearNow();
    const key = `purchases:${year}`;
    const counter = await this.invoiceCounterModel.findOneAndUpdate(
      { key },
      { $inc: { seq: 1 } },
      { upsert: true, new: true, session },
    );
    if (!counter) {
      throw new BadRequestException('Failed to allocate purchase invoice number');
    }
    const seq = String(counter.seq).padStart(4, '0');
    return `PUR-${seq}`;
  }

  private async buildListFilter(query: ListPurchaseInvoicesQueryDto): Promise<PurchaseInvoiceListFilter> {
    const filter: PurchaseInvoiceListFilter = {};

    if (query.supplierId) {
      filter.supplierId = new Types.ObjectId(query.supplierId);
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.from || query.to) {
      if (query.period || query.date) throw new BadRequestException('Choose a period or a custom range');
      try {
        const { from, to } = cairoCustomRange(query.from, query.to);
        filter.createdAt = { $gte: from, $lt: to };
      } catch {
        throw new BadRequestException('Invalid custom date range');
      }
    } else if (query.period && query.date) {
      try {
        const { from, to } = cairoPeriodRange(query.period, query.date);
        filter.createdAt = { $gte: from, $lt: to };
      } catch {
        throw new BadRequestException('Invalid date for period filter');
      }
    }

    if (query.q?.trim()) {
      const escaped = query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const matchingSuppliers = await this.supplierModel
        .find({
          isDeleted: false,
          $or: [{ name: { $regex: escaped, $options: 'i' } }, { phone: { $regex: escaped, $options: 'i' } }],
        })
        .select('_id')
        .lean()
        .exec();

      const supplierIds = matchingSuppliers.map((s) => s._id);
      filter.$or = [
        { invoiceNumber: { $regex: escaped, $options: 'i' } },
        ...(supplierIds.length > 0 ? [{ supplierId: { $in: supplierIds } }] : []),
      ];
    }

    return filter;
  }

  private async accountPaymentAmounts(
    invoices: PurchaseInvoiceDocument[],
    session?: ClientSession,
  ): Promise<Map<string, number>> {
    const accounts = invoices.filter((invoice) => invoice.supplierId);
    if (!accounts.length) return new Map();
    const rows = await this.supplierPaymentModel.aggregate<{ _id: Types.ObjectId; amount: number }>(
      [
        {
          $match: {
            reversedAt: null,
            purchaseInvoiceId: null,
            $or: accounts.map((invoice) => ({ sourcePurchaseInvoiceId: invoice._id, supplierId: invoice.supplierId })),
          },
        },
        { $group: { _id: '$sourcePurchaseInvoiceId', amount: { $sum: '$amount' } } },
      ],
      { session },
    );
    return new Map(rows.map((row) => [row._id.toString(), roundMoney(row.amount)]));
  }

  private async toResponseWithAccountPayment(
    invoice: PurchaseInvoiceDocument,
    session?: ClientSession,
  ): Promise<PurchaseInvoiceResponseDto> {
    const amounts = await this.accountPaymentAmounts([invoice], session);
    return this.toResponseDto(invoice, amounts.get(invoice._id.toString()) ?? 0);
  }

  private async supplierNamesForRows(rows: PurchaseInvoiceDocument[]): Promise<Map<string, string>> {
    const ids = [...new Set(rows.map((row) => row.supplierId.toString()))];
    if (ids.length === 0) return new Map();
    const accounts = await this.supplierModel
      .find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) }, isDeleted: false })
      .select('_id name')
      .lean()
      .exec();
    return new Map(accounts.map((account) => [account._id.toString(), account.name]));
  }

  private toResponseDto(invoice: PurchaseInvoiceDocument, accountPaymentAmount = 0): PurchaseInvoiceResponseDto {
    return {
      id: invoice._id.toString(),
      invoiceNumber: invoice.invoiceNumber,
      supplierId: invoice.supplierId.toString(),
      lines: invoice.lines.map((line) => ({
        itemId: line.itemId.toString(),
        quantity: line.quantity,
        width: line.width ?? null,
        pricingModeSnapshot: resolveLinePricingMode(line),
        length: line.length ?? null,
        thickness: line.thickness ?? null,
        unitCost: line.unitCost,
        lineTotal: line.lineTotal,
        note: line.note ?? null,
      })),
      total: invoice.total,
      paid: invoice.paid,
      accountPaymentAmount,
      remaining: invoice.remaining,
      status: invoice.status,
      notes: invoice.notes ?? null,
      createdBy: invoice.createdBy.toString(),
      createdAt: invoice.get('createdAt') as Date | undefined,
      updatedAt: invoice.get('updatedAt') as Date | undefined,
    };
  }
}
