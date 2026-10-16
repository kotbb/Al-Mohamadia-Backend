import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { roundMoney } from '../../shared/utils/round-money/round-money.util';
import { AuditService } from '../audit/audit.service';
import { Category, CategoryDocument } from '../categories/schemas/category.schema';
import { Item, ItemDocument } from '../items/schemas/item.schema';
import { AdjustStockResponseDto } from './dto/response/adjust-stock-response.dto';
import { CreateStockAdjustmentDto } from './dto/request/create-stock-adjustment.dto';
import { InventoryValuationResponseDto } from './dto/response/inventory-valuation-response.dto';
import { ListStockQueryDto } from './dto/request/list-stock-query.dto';
import { StockItemResponseDto, StockListResponseDto } from './dto/response/stock-list-response.dto';
import { StockStatusFilter } from './enums/stock-status-filter.enum';

@Injectable()
export class InventoryService {
  constructor(
    @InjectModel(Item.name)
    private readonly itemModel: Model<ItemDocument>,
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly auditService: AuditService,
  ) {}

  // 1. Manual stock adjustment
  public async adjustStock(dto: CreateStockAdjustmentDto, user: AuthUser): Promise<AdjustStockResponseDto> {
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
      const reason = dto.reason.trim();
      lockedItem.stockQuantity = newQuantity;
      await lockedItem.save({ session });

      await this.auditService.log(
        {
          userId: user.id,
          action: 'stock_adjusted',
          entityType: 'Item',
          entityId: lockedItem._id.toString(),
          changes: {
            stockQuantity: { old: oldQuantity, new: newQuantity },
            reason: { old: null, new: reason },
          },
          refCollection: null,
          refId: null,
          summary: `Stock adjusted: ${lockedItem.name}`,
        },
        session,
      );

      await session.commitTransaction();

      return {
        itemId: lockedItem._id.toString(),
        oldQuantity,
        newQuantity,
        reason,
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
    const limit = Math.min(query.limit ?? 10, 100);
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
}
