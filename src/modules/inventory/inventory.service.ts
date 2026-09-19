import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { cairoPeriodRange } from '../../shared/utils/period/cairo-period.util';
import { roundMoney } from '../../shared/utils/round-money/round-money.util';
import { AuditService } from '../audit/audit.service';
import { Category, CategoryDocument } from '../categories/schemas/category.schema';
import { Item, ItemDocument } from '../items/schemas/item.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { CreateStockAdjustmentDto } from './dto/create-stock-adjustment.dto';
import { InventoryValuationResponseDto } from './dto/inventory-valuation-response.dto';
import { ListAdjustmentsQueryDto } from './dto/list-adjustments-query.dto';
import { ListStockQueryDto } from './dto/list-stock-query.dto';
import { StockAdjustmentListResponseDto, StockAdjustmentResponseDto } from './dto/stock-adjustment-response.dto';
import { StockItemResponseDto, StockListResponseDto } from './dto/stock-list-response.dto';
import { StockStatusFilter } from './enums/stock-status-filter.enum';
import { StockAdjustment, StockAdjustmentDocument } from './schemas/stock-adjustment.schema';

@Injectable()
export class InventoryService {
  constructor(
    @InjectModel(StockAdjustment.name)
    private readonly stockAdjustmentModel: Model<StockAdjustmentDocument>,
    @InjectModel(Item.name)
    private readonly itemModel: Model<ItemDocument>,
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly auditService: AuditService,
  ) {}

  // 1. Manual Stock Audit Adjustment
  public async adjustStock(dto: CreateStockAdjustmentDto, user: AuthUser): Promise<StockAdjustmentResponseDto> {
    const item = await this.itemModel.findOne({ _id: dto.itemId, isDeleted: false }).exec();
    if (!item) {
      throw new NotFoundException('Item not found');
    }

    const newQuantity = roundMoney(dto.newQuantity);
    if (newQuantity === item.stockQuantity) {
      throw new BadRequestException('New quantity matches current stock quantity');
    }

    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const lockedItem = await this.itemModel.findOne({ _id: dto.itemId, isDeleted: false }).session(session).exec();

      if (!lockedItem) {
        throw new NotFoundException('Item not found');
      }

      if (newQuantity === lockedItem.stockQuantity) {
        throw new BadRequestException('New quantity matches current stock quantity');
      }

      const oldQuantity = lockedItem.stockQuantity;
      lockedItem.stockQuantity = newQuantity;
      await lockedItem.save({ session });

      const [createdAdjustment] = await this.stockAdjustmentModel.create(
        [
          {
            itemId: lockedItem._id,
            oldQuantity,
            newQuantity,
            reason: dto.reason.trim(),
            adjustedBy: new Types.ObjectId(user.id),
          },
        ],
        { session },
      );

      await this.auditService.log(
        {
          userId: user.id,
          action: 'stock_adjusted',
          entityType: 'Item',
          entityId: lockedItem._id.toString(),
          changes: null,
          refCollection: 'StockAdjustment',
          refId: createdAdjustment._id.toString(),
          summary: `stockQuantity: ${oldQuantity} → ${newQuantity} (${dto.reason.trim()})`,
        },
        session,
      );

      await session.commitTransaction();

      return {
        id: createdAdjustment._id.toString(),
        itemId: lockedItem._id.toString(),
        item: {
          id: lockedItem._id.toString(),
          code: lockedItem.code,
          name: lockedItem.name,
        },
        oldQuantity,
        newQuantity,
        diffQuantity: roundMoney(newQuantity - oldQuantity),
        reason: createdAdjustment.reason,
        adjustedBy: user.id,
        adjuster: {
          id: user.id,
          username: user.username,
        },
        createdAt: createdAdjustment.get('createdAt') as Date | undefined,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // 2. Stock Health Overview List
  public async getStockList(query: ListStockQueryDto): Promise<StockListResponseDto> {
    const baseFilter: Record<string, unknown> = { isDeleted: false };

    if (query.categoryId) {
      baseFilter.categoryId = new Types.ObjectId(query.categoryId);
    }

    if (query.q?.trim()) {
      const escaped = query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      baseFilter.$or = [{ name: { $regex: escaped, $options: 'i' } }, { code: { $regex: escaped, $options: 'i' } }];
    }

    // Apply stockStatus filter to query
    const status = query.stockStatus ?? StockStatusFilter.ALL;
    const filter = { ...baseFilter };

    if (status === StockStatusFilter.OUT_OF_STOCK) {
      filter.stockQuantity = 0;
    } else if (status === StockStatusFilter.NEGATIVE_STOCK) {
      filter.stockQuantity = { $lt: 0 };
    } else if (status === StockStatusFilter.LOW_STOCK) {
      filter.$expr = {
        $and: [{ $gt: ['$stockQuantity', 0] }, { $lte: ['$stockQuantity', '$reorderThreshold'] }],
      };
    } else if (status === StockStatusFilter.NORMAL) {
      filter.$expr = {
        $gt: ['$stockQuantity', '$reorderThreshold'],
      };
    }

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    // Parallel execution: fetch paginated items, count filtered, and aggregate stock KPI counts across baseFilter
    const [rawItems, total, kpiAgg] = await Promise.all([
      this.itemModel
        .find(filter)
        .populate('categoryId', 'name')
        .sort({ stockQuantity: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.itemModel.countDocuments(filter).exec(),
      this.itemModel.aggregate<{
        totalItems: number;
        lowStockCount: number;
        outOfStockCount: number;
        negativeStockCount: number;
        normalStockCount: number;
      }>([
        { $match: baseFilter },
        {
          $group: {
            _id: null,
            totalItems: { $sum: 1 },
            outOfStockCount: {
              $sum: { $cond: [{ $eq: ['$stockQuantity', 0] }, 1, 0] },
            },
            negativeStockCount: {
              $sum: { $cond: [{ $lt: ['$stockQuantity', 0] }, 1, 0] },
            },
            lowStockCount: {
              $sum: {
                $cond: [
                  {
                    $and: [{ $gt: ['$stockQuantity', 0] }, { $lte: ['$stockQuantity', '$reorderThreshold'] }],
                  },
                  1,
                  0,
                ],
              },
            },
            normalStockCount: {
              $sum: {
                $cond: [{ $gt: ['$stockQuantity', '$reorderThreshold'] }, 1, 0],
              },
            },
          },
        },
      ]),
    ]);

    const summary =
      kpiAgg.length > 0
        ? {
            totalItems: kpiAgg[0].totalItems,
            lowStockCount: kpiAgg[0].lowStockCount,
            outOfStockCount: kpiAgg[0].outOfStockCount,
            negativeStockCount: kpiAgg[0].negativeStockCount,
            normalStockCount: kpiAgg[0].normalStockCount,
          }
        : {
            totalItems: 0,
            lowStockCount: 0,
            outOfStockCount: 0,
            negativeStockCount: 0,
            normalStockCount: 0,
          };

    const items: StockItemResponseDto[] = rawItems.map((item) => {
      const categoryDoc = item.categoryId as unknown as CategoryDocument | null;
      const stock = item.stockQuantity;
      const threshold = item.reorderThreshold;

      const isLowStock = stock > 0 && stock <= threshold;
      const isOutOfStock = stock === 0;
      const isNegativeStock = stock < 0;

      const positiveStock = stock > 0 ? stock : 0;
      const valuationAtCost = roundMoney(positiveStock * item.cost);
      const valuationAtSellingPrice = roundMoney(positiveStock * item.unitPrice);

      return {
        id: item._id.toString(),
        code: item.code,
        name: item.name,
        categoryId: categoryDoc ? categoryDoc._id.toString() : item.categoryId.toString(),
        category: categoryDoc
          ? {
              id: categoryDoc._id.toString(),
              name: categoryDoc.name,
            }
          : null,
        isWood: item.isWood,
        pricingMode: item.pricingMode,
        unitPrice: item.unitPrice,
        cost: item.cost,
        stockQuantity: item.stockQuantity,
        reorderThreshold: item.reorderThreshold,
        isActive: item.isActive,
        isLowStock,
        isOutOfStock,
        isNegativeStock,
        valuationAtCost,
        valuationAtSellingPrice,
        createdAt: item.get('createdAt') as Date | undefined,
        updatedAt: item.get('updatedAt') as Date | undefined,
      };
    });

    return {
      items,
      meta: {
        page,
        limit,
        total,
      },
      summary,
    };
  }

  // 3. Inventory Valuation
  public async getValuation(): Promise<InventoryValuationResponseDto> {
    const filter = { isDeleted: false, isActive: true };

    const [totalAgg, categoryAgg] = await Promise.all([
      this.itemModel.aggregate<{
        totalItemsCount: number;
        totalValuationAtCost: number;
        totalValuationAtSellingPrice: number;
      }>([
        { $match: filter },
        {
          $project: {
            positiveStock: { $cond: [{ $gt: ['$stockQuantity', 0] }, '$stockQuantity', 0] },
            cost: '$cost',
            unitPrice: '$unitPrice',
          },
        },
        {
          $group: {
            _id: null,
            totalItemsCount: { $sum: 1 },
            totalValuationAtCost: { $sum: { $multiply: ['$positiveStock', '$cost'] } },
            totalValuationAtSellingPrice: { $sum: { $multiply: ['$positiveStock', '$unitPrice'] } },
          },
        },
      ]),
      this.itemModel.aggregate<{
        _id: Types.ObjectId;
        categoryName: string;
        itemsCount: number;
        valuationAtCost: number;
        valuationAtSellingPrice: number;
      }>([
        { $match: filter },
        {
          $project: {
            categoryId: '$categoryId',
            positiveStock: { $cond: [{ $gt: ['$stockQuantity', 0] }, '$stockQuantity', 0] },
            cost: '$cost',
            unitPrice: '$unitPrice',
          },
        },
        {
          $group: {
            _id: '$categoryId',
            itemsCount: { $sum: 1 },
            valuationAtCost: { $sum: { $multiply: ['$positiveStock', '$cost'] } },
            valuationAtSellingPrice: { $sum: { $multiply: ['$positiveStock', '$unitPrice'] } },
          },
        },
        {
          $lookup: {
            from: 'categories',
            localField: '_id',
            foreignField: '_id',
            as: 'category',
          },
        },
        { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            categoryName: { $ifNull: ['$category.name', 'Unknown'] },
            itemsCount: 1,
            valuationAtCost: 1,
            valuationAtSellingPrice: 1,
          },
        },
        { $sort: { valuationAtCost: -1 } },
      ]),
    ]);

    const totalValuationAtCost = totalAgg.length > 0 ? roundMoney(totalAgg[0].totalValuationAtCost) : 0;
    const totalValuationAtSellingPrice = totalAgg.length > 0 ? roundMoney(totalAgg[0].totalValuationAtSellingPrice) : 0;
    const totalItemsCount = totalAgg.length > 0 ? totalAgg[0].totalItemsCount : 0;
    const potentialProfit = roundMoney(totalValuationAtSellingPrice - totalValuationAtCost);

    const categories = categoryAgg.map((cat) => ({
      categoryId: cat._id.toString(),
      categoryName: cat.categoryName,
      itemsCount: cat.itemsCount,
      valuationAtCost: roundMoney(cat.valuationAtCost),
      valuationAtSellingPrice: roundMoney(cat.valuationAtSellingPrice),
    }));

    return {
      totalItemsCount,
      totalValuationAtCost,
      totalValuationAtSellingPrice,
      potentialProfit,
      categories,
    };
  }

  // 4. Adjustments List
  public async getAdjustments(query: ListAdjustmentsQueryDto): Promise<StockAdjustmentListResponseDto> {
    if (query.period !== undefined && !query.date) {
      throw new BadRequestException('date is required when period is set');
    }
    if (query.date && query.period === undefined) {
      throw new BadRequestException('period is required when date is set');
    }

    const filter: Record<string, unknown> = {};

    if (query.itemId) {
      filter.itemId = new Types.ObjectId(query.itemId);
    }

    if (query.period && query.date) {
      try {
        const { from, to } = cairoPeriodRange(query.period, query.date);
        filter.createdAt = { $gte: from, $lt: to };
      } catch {
        throw new BadRequestException('Invalid date for period filter');
      }
    }

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const [docs, total] = await Promise.all([
      this.stockAdjustmentModel
        .find(filter)
        .populate('itemId', 'code name')
        .populate('adjustedBy', 'username')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.stockAdjustmentModel.countDocuments(filter).exec(),
    ]);

    const items: StockAdjustmentResponseDto[] = docs.map((doc) => {
      const itemDoc = doc.itemId as unknown as ItemDocument | null;
      const userDoc = doc.adjustedBy as unknown as UserDocument | null;

      return {
        id: doc._id.toString(),
        itemId: itemDoc ? itemDoc._id.toString() : doc.itemId.toString(),
        item: itemDoc
          ? {
              id: itemDoc._id.toString(),
              code: itemDoc.code,
              name: itemDoc.name,
            }
          : null,
        oldQuantity: doc.oldQuantity,
        newQuantity: doc.newQuantity,
        diffQuantity: roundMoney(doc.newQuantity - doc.oldQuantity),
        reason: doc.reason,
        adjustedBy: userDoc ? userDoc._id.toString() : doc.adjustedBy.toString(),
        adjuster: userDoc
          ? {
              id: userDoc._id.toString(),
              username: userDoc.username,
            }
          : null,
        createdAt: doc.get('createdAt') as Date | undefined,
      };
    });

    return {
      items,
      meta: {
        page,
        limit,
        total,
      },
    };
  }

  // 5. Single Adjustment By ID
  public async getAdjustmentById(id: string): Promise<StockAdjustmentResponseDto> {
    const doc = await this.stockAdjustmentModel
      .findById(id)
      .populate('itemId', 'code name')
      .populate('adjustedBy', 'username')
      .exec();

    if (!doc) {
      throw new NotFoundException('Stock adjustment not found');
    }

    const itemDoc = doc.itemId as unknown as ItemDocument | null;
    const userDoc = doc.adjustedBy as unknown as UserDocument | null;

    return {
      id: doc._id.toString(),
      itemId: itemDoc ? itemDoc._id.toString() : doc.itemId.toString(),
      item: itemDoc
        ? {
            id: itemDoc._id.toString(),
            code: itemDoc.code,
            name: itemDoc.name,
          }
        : null,
      oldQuantity: doc.oldQuantity,
      newQuantity: doc.newQuantity,
      diffQuantity: roundMoney(doc.newQuantity - doc.oldQuantity),
      reason: doc.reason,
      adjustedBy: userDoc ? userDoc._id.toString() : doc.adjustedBy.toString(),
      adjuster: userDoc
        ? {
            id: userDoc._id.toString(),
            username: userDoc.username,
          }
        : null,
      createdAt: doc.get('createdAt') as Date | undefined,
    };
  }
}
