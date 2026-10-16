import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { AuditService } from '../audit/audit.service';
import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
import { Item, ItemDocument } from '../items/schemas/item.schema';
import { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { PaymentMethod } from '../../shared/enums/payment-method.enum';
import { PricingMode } from '../../shared/enums/pricing-mode.enum';
import { resolveLinePricingMode } from '../../shared/utils/volume/line-pricing-mode.util';
import { SalesInvoiceStatus } from '../../shared/enums/sales-invoice-status.enum';
import { SalesInvoiceType } from '../../shared/enums/sales-invoice-type.enum';
import { cairoCustomRange, cairoPeriodRange, cairoYearNow } from '../../shared/utils/period/cairo-period.util';
import { roundMoney } from '../../shared/utils/round-money/round-money.util';
import { lineTotalForPricing, stockDeltaForLine } from '../../shared/utils/volume/cubic-meter.util';
import { SHOP_NAME } from './constants/shop.constant';
import { CreateSalesInvoiceDto, CreateSalesInvoiceLineDto } from './dto/create-sales-invoice.dto';
import { UpdateSalesInvoiceDto } from './dto/update-sales-invoice.dto';
import { ListSalesInvoicesQueryDto } from './dto/list-sales-invoices-query.dto';
import { SalesInvoiceListResponseDto, SalesInvoiceResponseDto } from './dto/sales-invoice-response.dto';
import { SalesInvoiceShareResponseDto } from './dto/sales-invoice-share-response.dto';
import { PublicInvoiceResponseDto } from './dto/public-invoice-response.dto';
import { InvoiceCounter, InvoiceCounterDocument } from './schemas/invoice-counter.schema';
import { Payment, PaymentDocument } from '../payments/schemas/payment.schema';
import { SalesInvoice, SalesInvoiceDocument } from './schemas/sales-invoice.schema';
import { BuiltLine } from './types/built-line.type';
import { SalesInvoiceListFilter } from './types/sales-invoice-list-filter.type';

@Injectable()
export class SalesInvoicesService {
  constructor(
    @InjectModel(SalesInvoice.name)
    private readonly salesInvoiceModel: Model<SalesInvoiceDocument>,
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(InvoiceCounter.name)
    private readonly invoiceCounterModel: Model<InvoiceCounterDocument>,
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(Item.name)
    private readonly itemModel: Model<ItemDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  // Create a new sales invoice
  public async create(dto: CreateSalesInvoiceDto, user: AuthUser): Promise<SalesInvoiceResponseDto> {
    if (!dto.lines?.length) {
      throw new BadRequestException('Invoice must have at least one line');
    }

    if (dto.type === SalesInvoiceType.CASH_SALE && dto.customerId) {
      throw new BadRequestException('Cash sale must not include a customerId');
    }

    if (dto.type === SalesInvoiceType.CUSTOMER_SALE && !dto.customerId) {
      throw new BadRequestException('Customer sale requires a customerId');
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

    let customer: CustomerDocument | null = null;
    if (dto.type === SalesInvoiceType.CUSTOMER_SALE && dto.customerId) {
      customer = await this.customerModel.findOne({ _id: dto.customerId, isDeleted: false }).exec();
      if (!customer) {
        throw new NotFoundException('Customer not found');
      }
      if (!customer.isActive) {
        throw new BadRequestException('Customer is inactive');
      }
    }

    const builtLines = dto.lines.map((lineDto) => this.buildLine(lineDto, itemById.get(lineDto.itemId)!));

    const total = roundMoney(builtLines.reduce((sum, row) => sum + row.line.lineTotal, 0));
    const discount = roundMoney(dto.discount ?? 0);
    if (discount < 0 || discount > total) {
      throw new BadRequestException('Discount must be between 0 and total');
    }

    const net = roundMoney(total - discount);
    const paid = roundMoney(dto.paid);
    if (paid < 0) {
      throw new BadRequestException('Paid amount cannot exceed net total or be negative');
    }

    if (dto.type === SalesInvoiceType.CASH_SALE) {
      if (paid !== net) {
        throw new BadRequestException('Cash sale must be paid in full');
      }
    } else if (paid > net) {
      throw new BadRequestException('Paid amount cannot exceed net total');
    }

    const remaining = roundMoney(net - paid);

    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const invoiceNumber = await this.nextInvoiceNumber(session);
      const customerId = dto.type === SalesInvoiceType.CUSTOMER_SALE && customer ? customer._id : null;

      const [created] = await this.salesInvoiceModel.create(
        [
          {
            invoiceNumber,
            type: dto.type,
            customerId,
            lines: builtLines.map((row) => row.line),
            total,
            discount,
            paid,
            remaining,
            status: SalesInvoiceStatus.SAVED,
            createdBy: new Types.ObjectId(user.id),
            pdfShareToken: null,
          },
        ],
        { session },
      );

      for (const row of builtLines) {
        await this.itemModel.updateOne({ _id: row.itemId }, { $inc: { stockQuantity: -row.stockDelta } }, { session });
      }

      if (dto.type === SalesInvoiceType.CUSTOMER_SALE && customer && remaining > 0) {
        customer.balance = roundMoney(customer.balance + remaining);
        await customer.save({ session });
      }

      if (paid > 0) {
        await this.paymentModel.create(
          [
            {
              customerId,
              invoiceId: created._id,
              amount: paid,
              method: dto.paymentMethod ?? PaymentMethod.CASH,
              notes: dto.paymentNotes ? dto.paymentNotes.trim() : null,
              recordedBy: new Types.ObjectId(user.id),
              reversedAt: null,
              reversedBy: null,
            },
          ],
          { session },
        );
      }

      await this.auditService.log(
        {
          userId: user.id,
          action: 'invoice_created',
          entityType: 'SalesInvoice',
          entityId: created._id.toString(),
          changes: {
            invoiceNumber: { old: null, new: created.invoiceNumber },
            type: { old: null, new: created.type },
            customerId: { old: null, new: customer?.name ?? null },
            total: { old: null, new: created.total },
            discount: { old: null, new: created.discount },
            paid: { old: null, new: created.paid },
            remaining: { old: null, new: created.remaining },
            status: { old: null, new: created.status },
          },
          refCollection: null,
          refId: null,
          summary: `Invoice created: ${created.invoiceNumber}`,
        },
        session,
      );

      await session.commitTransaction();
      return this.toResponseDto(created);
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Get all sales invoices
  public async findAll(query: ListSalesInvoicesQueryDto): Promise<SalesInvoiceListResponseDto> {
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

    const activeFilter = { ...filter, status: SalesInvoiceStatus.SAVED };

    const [docs, total, summaryAgg] = await Promise.all([
      this.salesInvoiceModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.salesInvoiceModel.countDocuments(filter).exec(),
      this.salesInvoiceModel.aggregate<{ totalAmount: number }>([
        { $match: activeFilter },
        { $group: { _id: null, totalAmount: { $sum: '$total' } } },
      ]),
    ]);

    const totalAmount = summaryAgg.length > 0 ? roundMoney(summaryAgg[0].totalAmount) : 0;

    return {
      items: docs.map((doc) => this.toResponseDto(doc)),
      meta: { page, limit, total },
      summary: { totalAmount },
    };
  }

  // Get a single sales invoice
  public async findOne(id: string): Promise<SalesInvoiceResponseDto> {
    const invoice = await this.requireInvoiceById(id);
    return this.toResponseDto(invoice);
  }

  // Cancel a sales invoice
  public async cancel(id: string, user: AuthUser): Promise<SalesInvoiceResponseDto> {
    const invoice = await this.requireInvoiceById(id);
    if (invoice.status !== SalesInvoiceStatus.SAVED) {
      throw new BadRequestException('Only saved invoices can be cancelled');
    }

    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const itemIds = invoice.lines.map((line) => line.itemId);
      const items = await this.itemModel
        .find({ _id: { $in: itemIds } })
        .session(session)
        .exec();
      const itemById = new Map(items.map((item) => [item._id.toString(), item]));

      for (const line of invoice.lines) {
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

        await this.itemModel.updateOne({ _id: line.itemId }, { $inc: { stockQuantity: stockDelta } }, { session });
      }

      if (invoice.type === SalesInvoiceType.CUSTOMER_SALE && invoice.customerId && invoice.remaining > 0) {
        const customer = await this.customerModel.findById(invoice.customerId).session(session).exec();
        if (!customer) {
          throw new NotFoundException('Customer not found');
        }
        customer.balance = roundMoney(customer.balance - invoice.remaining);
        await customer.save({ session });
      }

      const now = new Date();
      await this.paymentModel.updateMany(
        {
          invoiceId: invoice._id,
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

      const oldStatus = invoice.status;
      invoice.status = SalesInvoiceStatus.CANCELLED;
      await invoice.save({ session });

      await this.auditService.log(
        {
          userId: user.id,
          action: 'invoice_cancelled',
          entityType: 'SalesInvoice',
          entityId: invoice._id.toString(),
          changes: {
            status: { old: oldStatus, new: SalesInvoiceStatus.CANCELLED },
            remainingReversed: { old: invoice.remaining, new: 0 },
          },
          refCollection: null,
          refId: null,
          summary: `Invoice cancelled: ${invoice.invoiceNumber}`,
        },
        session,
      );

      await session.commitTransaction();
      return this.toResponseDto(invoice);
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Update an existing sales invoice
  public async update(id: string, dto: UpdateSalesInvoiceDto, user: AuthUser): Promise<SalesInvoiceResponseDto> {
    const invoice = await this.requireInvoiceById(id);
    if (invoice.status !== SalesInvoiceStatus.SAVED) {
      throw new BadRequestException('Only saved invoices can be edited');
    }

    const itemIds = Array.from(new Set(dto.lines.map((l) => l.itemId)));
    const items = await this.itemModel.find({ _id: { $in: itemIds } }).exec();
    if (items.length !== itemIds.length) {
      throw new NotFoundException('One or more items not found');
    }
    for (const item of items) {
      if (!item.isActive) {
        throw new BadRequestException(`Item is inactive: ${item.name}`);
      }
    }
    const itemById = new Map(items.map((i) => [i._id.toString(), i]));

    let customer: CustomerDocument | null = null;
    if (dto.type === SalesInvoiceType.CUSTOMER_SALE) {
      if (!dto.customerId) {
        throw new BadRequestException('Customer is required for customer sales');
      }
      customer = await this.customerModel.findOne({ _id: dto.customerId, isDeleted: false }).exec();
      if (!customer) {
        throw new NotFoundException('Customer not found');
      }
      if (!customer.isActive) {
        throw new BadRequestException('Customer is inactive');
      }
    }

    const builtLines = dto.lines.map((lineDto) => this.buildLine(lineDto, itemById.get(lineDto.itemId)!));

    const total = roundMoney(builtLines.reduce((sum, row) => sum + row.line.lineTotal, 0));
    const discount = roundMoney(dto.discount ?? 0);
    if (discount < 0 || discount > total) {
      throw new BadRequestException('Discount must be between 0 and total');
    }

    const net = roundMoney(total - discount);
    const paid = roundMoney(dto.paid);
    if (paid < 0) {
      throw new BadRequestException('Paid amount cannot be negative');
    }

    if (dto.type === SalesInvoiceType.CASH_SALE) {
      if (paid !== net) {
        throw new BadRequestException('Cash sale must be paid in full');
      }
    } else if (paid > net) {
      throw new BadRequestException('Paid amount cannot exceed net total');
    }

    const remaining = roundMoney(net - paid);

    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      // 1. Revert previous lines stock
      const oldItemIds = invoice.lines.map((line) => line.itemId);
      const oldItems = await this.itemModel
        .find({ _id: { $in: oldItemIds } })
        .session(session)
        .exec();
      const oldItemById = new Map(oldItems.map((item) => [item._id.toString(), item]));

      for (const line of invoice.lines) {
        const item = oldItemById.get(line.itemId.toString());
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

        await this.itemModel.updateOne({ _id: line.itemId }, { $inc: { stockQuantity: stockDelta } }, { session });
      }

      // 2. Apply new lines stock
      for (const row of builtLines) {
        await this.itemModel.updateOne({ _id: row.itemId }, { $inc: { stockQuantity: -row.stockDelta } }, { session });
      }

      // 3. Customer balance adjustments
      const oldCustomerId = invoice.customerId;
      const oldRemaining = invoice.remaining;
      const newCustomerId = dto.type === SalesInvoiceType.CUSTOMER_SALE && customer ? customer._id : null;

      const isSameCustomer =
        oldCustomerId &&
        newCustomerId &&
        oldCustomerId.toString() === newCustomerId.toString() &&
        invoice.type === SalesInvoiceType.CUSTOMER_SALE &&
        dto.type === SalesInvoiceType.CUSTOMER_SALE;

      if (isSameCustomer) {
        const delta = roundMoney(remaining - oldRemaining);
        if (delta !== 0) {
          const cust = await this.customerModel.findById(newCustomerId).session(session).exec();
          if (!cust) {
            throw new NotFoundException('Customer not found');
          }
          cust.balance = roundMoney(cust.balance + delta);
          await cust.save({ session });
        }
      } else {
        // Revert old customer's remaining balance
        if (invoice.type === SalesInvoiceType.CUSTOMER_SALE && oldCustomerId && oldRemaining > 0) {
          const oldCust = await this.customerModel.findById(oldCustomerId).session(session).exec();
          if (oldCust) {
            oldCust.balance = roundMoney(oldCust.balance - oldRemaining);
            await oldCust.save({ session });
          }
        }

        // Apply new customer's remaining balance
        if (dto.type === SalesInvoiceType.CUSTOMER_SALE && newCustomerId && remaining > 0) {
          const targetCust = await this.customerModel.findById(newCustomerId).session(session).exec();
          if (!targetCust) {
            throw new NotFoundException('Customer not found');
          }
          targetCust.balance = roundMoney(targetCust.balance + remaining);
          await targetCust.save({ session });
        }
      }

      // 4. Payment reconciliation (In-Place Update)
      const existingPayment = await this.paymentModel
        .findOne({
          invoiceId: invoice._id,
          reversedAt: null,
        })
        .session(session)
        .exec();

      if (paid > 0) {
        if (existingPayment) {
          existingPayment.amount = paid;
          existingPayment.method = dto.paymentMethod ?? existingPayment.method ?? PaymentMethod.CASH;
          existingPayment.customerId = newCustomerId;
          existingPayment.notes = dto.paymentNotes ? dto.paymentNotes.trim() : null;
          await existingPayment.save({ session });
        } else {
          await this.paymentModel.create(
            [
              {
                customerId: newCustomerId,
                invoiceId: invoice._id,
                amount: paid,
                method: dto.paymentMethod ?? PaymentMethod.CASH,
                notes: dto.paymentNotes ? dto.paymentNotes.trim() : null,
                recordedBy: new Types.ObjectId(user.id),
                reversedAt: null,
                reversedBy: null,
              },
            ],
            { session },
          );
        }
      } else if (existingPayment) {
        existingPayment.reversedAt = new Date();
        existingPayment.reversedBy = new Types.ObjectId(user.id);
        await existingPayment.save({ session });
      }

      // 5. Update invoice document
      const oldType = invoice.type;
      const oldTotal = invoice.total;
      const oldDiscount = invoice.discount;
      const oldPaid = invoice.paid;

      invoice.type = dto.type;
      invoice.customerId = newCustomerId;
      invoice.lines = builtLines.map((row) => row.line);
      invoice.total = total;
      invoice.discount = discount;
      invoice.paid = paid;
      invoice.remaining = remaining;
      await invoice.save({ session });

      // 6. Audit log
      await this.auditService.log(
        {
          userId: user.id,
          action: 'invoice_updated',
          entityType: 'SalesInvoice',
          entityId: invoice._id.toString(),
          changes: {
            type: { old: oldType, new: invoice.type },
            customerId: { old: oldCustomerId?.toString() ?? null, new: newCustomerId?.toString() ?? null },
            total: { old: oldTotal, new: total },
            discount: { old: oldDiscount, new: discount },
            paid: { old: oldPaid, new: paid },
            remaining: { old: oldRemaining, new: remaining },
          },
          refCollection: null,
          refId: null,
          summary: `Invoice updated: ${invoice.invoiceNumber}`,
        },
        session,
      );

      await session.commitTransaction();
      return this.toResponseDto(invoice);
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Get a public invoice payload by token (no auth required)
  public async getPublicInvoiceByToken(token: string): Promise<PublicInvoiceResponseDto> {
    const invoice = await this.salesInvoiceModel.findOne({ pdfShareToken: token }).exec();
    if (!invoice) {
      throw new NotFoundException('Sales invoice not found');
    }

    return this.toReceiptDto(invoice);
  }

  // Get a receipt payload by invoice ID
  public async getReceipt(id: string): Promise<PublicInvoiceResponseDto> {
    return this.toReceiptDto(await this.requireInvoiceById(id));
  }

  // Get the previous and next invoice IDs for a given invoice
  public async getNeighbors(id: string): Promise<{ previousId: string | null; nextId: string | null }> {
    const invoice = await this.requireInvoiceById(id);
    if (!invoice.customerId || invoice.type !== SalesInvoiceType.CUSTOMER_SALE) {
      return { previousId: null, nextId: null };
    }

    const createdAt = invoice.get('createdAt') as Date;
    const base = { customerId: invoice.customerId, type: SalesInvoiceType.CUSTOMER_SALE };
    const [previous, next] = await Promise.all([
      this.salesInvoiceModel
        .findOne({ ...base, $or: [{ createdAt: { $lt: createdAt } }, { createdAt, _id: { $lt: invoice._id } }] })
        .sort({ createdAt: -1, _id: -1 })
        .select('_id')
        .lean()
        .exec(),
      this.salesInvoiceModel
        .findOne({ ...base, $or: [{ createdAt: { $gt: createdAt } }, { createdAt, _id: { $gt: invoice._id } }] })
        .sort({ createdAt: 1, _id: 1 })
        .select('_id')
        .lean()
        .exec(),
    ]);
    return {
      previousId: previous?._id.toString() ?? null,
      nextId: next?._id.toString() ?? null,
    };
  }

  // Get a share payload by invoice ID
  public async getSharePayload(id: string): Promise<SalesInvoiceShareResponseDto> {
    const invoice = await this.requireInvoiceById(id);

    if (!invoice.pdfShareToken) {
      invoice.pdfShareToken = randomBytes(32).toString('hex');
      await invoice.save();
    }

    const frontendUrl = this.configService
      .get<string>(
        'FRONTEND_URL',
        this.configService.get<string>('CORS_ORIGIN', 'http://localhost:3001') ?? 'http://localhost:3001',
      )
      .replace(/\/$/, '');
    const receiptUrl = `${frontendUrl}/ar/invoices/public/${invoice.pdfShareToken}`;
    const message = `فاتورة ${SHOP_NAME} رقم ${invoice.invoiceNumber}\n${receiptUrl}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

    return { pdfUrl: receiptUrl, whatsappUrl, message };
  }

  // ----------------- Helper Methods -----------------

  private async toReceiptDto(invoice: SalesInvoiceDocument): Promise<PublicInvoiceResponseDto> {
    const itemIds = invoice.lines.map((line) => line.itemId);
    const items = await this.itemModel.find({ _id: { $in: itemIds } }).exec();
    const itemById = new Map(items.map((item) => [item._id.toString(), item]));

    let customerName: string | null = null;
    if (invoice.customerId) {
      const customer = await this.customerModel.findById(invoice.customerId).exec();
      if (customer) customerName = customer.name;
    }

    const createdAt = (invoice.get('createdAt') as Date | undefined) ?? new Date();

    return {
      invoiceNumber: invoice.invoiceNumber,
      createdAt: createdAt.toISOString(),
      status: invoice.status,
      type: invoice.type,
      customerName,
      lines: invoice.lines.map((line) => {
        const item = itemById.get(line.itemId.toString());
        return {
          itemLabel: item?.name ?? '',
          quantity: line.quantity,
          width: line.width ?? null,
          length: line.length ?? null,
          thickness: line.thickness ?? null,
          piecePrice: line.piecePrice,
          lineTotal: line.lineTotal,
          note: line.note ?? null,
        };
      }),
      total: invoice.total,
      discount: invoice.discount,
      paid: invoice.paid,
      remaining: invoice.remaining,
    };
  }

  private async requireInvoiceById(id: string): Promise<SalesInvoiceDocument> {
    const invoice = await this.salesInvoiceModel.findById(id).exec();
    if (!invoice) {
      throw new NotFoundException('Sales invoice not found');
    }
    return invoice;
  }

  private buildLine(lineDto: CreateSalesInvoiceLineDto, item: ItemDocument): BuiltLine {
    if (lineDto.piecePrice <= 0) {
      throw new BadRequestException('piecePrice must be greater than 0');
    }
    if (lineDto.quantity <= 0) {
      throw new BadRequestException('quantity must be greater than 0');
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

    const piecePrice = roundMoney(lineDto.piecePrice);
    const costPriceSnapshot = roundMoney(item.cost);
    const lineTotal = roundMoney(
      lineTotalForPricing({
        pricingMode: item.pricingMode,
        quantity: lineDto.quantity,
        piecePrice,
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
        piecePrice,
        costPriceSnapshot,
        lineTotal,
        note,
      },
    };
  }

  private async nextInvoiceNumber(session: ClientSession): Promise<string> {
    const year = cairoYearNow();
    const key = `sales:${year}`;
    const counter = await this.invoiceCounterModel.findOneAndUpdate(
      { key },
      { $inc: { seq: 1 } },
      { upsert: true, new: true, session },
    );
    if (!counter) {
      throw new BadRequestException('Failed to allocate invoice number');
    }
    const seq = String(counter.seq).padStart(4, '0');
    return `INV-${seq}`;
  }

  private async buildListFilter(query: ListSalesInvoicesQueryDto): Promise<SalesInvoiceListFilter> {
    const filter: SalesInvoiceListFilter = {};

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
      const matchingCustomers = await this.customerModel
        .find({
          isDeleted: false,
          $or: [{ name: { $regex: escaped, $options: 'i' } }, { phone: { $regex: escaped, $options: 'i' } }],
        })
        .select('_id')
        .lean()
        .exec();

      const customerIds = matchingCustomers.map((c) => c._id);
      filter.$or = [
        { invoiceNumber: { $regex: escaped, $options: 'i' } },
        ...(customerIds.length > 0 ? [{ customerId: { $in: customerIds } }] : []),
      ];
    }

    return filter;
  }

  private toResponseDto(invoice: SalesInvoiceDocument): SalesInvoiceResponseDto {
    return {
      id: invoice._id.toString(),
      invoiceNumber: invoice.invoiceNumber,
      type: invoice.type,
      customerId: invoice.customerId ? invoice.customerId.toString() : null,
      lines: invoice.lines.map((line) => ({
        itemId: line.itemId.toString(),
        quantity: line.quantity,
        width: line.width ?? null,
        pricingModeSnapshot: resolveLinePricingMode(line),
        length: line.length ?? null,
        thickness: line.thickness ?? null,
        piecePrice: line.piecePrice,
        costPriceSnapshot: line.costPriceSnapshot,
        lineTotal: line.lineTotal,
        note: line.note ?? null,
      })),
      total: invoice.total,
      discount: invoice.discount,
      paid: invoice.paid,
      remaining: invoice.remaining,
      status: invoice.status,
      createdBy: invoice.createdBy.toString(),
      createdAt: invoice.get('createdAt') as Date | undefined,
      updatedAt: invoice.get('updatedAt') as Date | undefined,
    };
  }
}
