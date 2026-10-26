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
import { PricingMode } from '../../shared/enums/pricing-mode.enum';
import type { StockCategoryCount, StockReadItem, StockReadPage } from './types/stock-read.types';

const STOCK_READ_FIELDS =
  '_id name categoryId isWood pricingMode unitPrice cost stockQuantity reorderThreshold isActive createdAt updatedAt';

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
    if (item.pricingMode === PricingMode.FREE_AMOUNT) {
      throw new BadRequestException('Free-amount items do not have stock');
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
      if (lockedItem.pricingMode === PricingMode.FREE_AMOUNT) {
        throw new BadRequestException('Free-amount items do not have stock');
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
    const baseFilter: Record<string, unknown> = { isDeleted: false, pricingMode: { $ne: PricingMode.FREE_AMOUNT } };

    if (query.categoryId) {
      baseFilter.categoryId = new Types.ObjectId(query.categoryId);
    }

    if (query.q?.trim()) {
      const escaped = query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      baseFilter.name = { $regex: escaped, $options: 'i' };
    }

    // Apply stockStatus filter to query
    const status = query.stockStatus ?? StockStatusFilter.ALL;
    const filter = { ...baseFilter };

    if (status === StockStatusFilter.OUT_OF_STOCK) {
      filter.stockQuantity = { $lte: 0 };
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
    const limit = Math.min(query.limit ?? (query.paginationMode === 'categories' ? 5 : 10), 100);

    // Parallel execution: fetch paginated items, count filtered, and aggregate stock KPI counts across baseFilter
    const [stockPage, kpiAgg] = await Promise.all([
      query.paginationMode === 'categories'
        ? this.getCategoryStockPage(filter, page, limit)
        : this.getItemStockPage(filter, page, limit),
      this.itemModel.aggregate<{
        totalItems: number;
        lowStockCount: number;
        outOfStockCount: number;
        normalStockCount: number;
      }>([
        { $match: baseFilter },
        {
          $group: {
            _id: null,
            totalItems: { $sum: 1 },
            outOfStockCount: {
              $sum: { $cond: [{ $lte: ['$stockQuantity', 0] }, 1, 0] },
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
            normalStockCount: kpiAgg[0].normalStockCount,
          }
        : {
            totalItems: 0,
            lowStockCount: 0,
            outOfStockCount: 0,
            normalStockCount: 0,
          };

    const items = stockPage.items.map((item) => this.toStockItemResponse(item, stockPage.categories));

    return {
      items,
      meta: stockPage.meta,
      summary,
    };
  }

  private async getItemStockPage(filter: Record<string, unknown>, page: number, limit: number): Promise<StockReadPage> {
    const [items, total] = await Promise.all([
      this.itemModel
        .find(filter)
        .select(STOCK_READ_FIELDS)
        .sort({ stockQuantity: 1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<StockReadItem[]>()
        .exec(),
      this.itemModel.countDocuments(filter).exec(),
    ]);
    const categoryIds = [...new Set(items.flatMap((item) => (item.categoryId ? [item.categoryId.toString()] : [])))];
    const categories = categoryIds.length
      ? await this.categoryModel
          .find({ _id: { $in: categoryIds } })
          .select('_id name')
          .lean<Array<{ _id: Types.ObjectId; name: string }>>()
          .exec()
      : [];
    return {
      items,
      categories: new Map(
        categories.map((category) => [category._id.toString(), { id: category._id.toString(), name: category.name }]),
      ),
      meta: { page, limit, total },
    };
  }

  private async getCategoryStockPage(
    filter: Record<string, unknown>,
    page: number,
    limit: number,
  ): Promise<StockReadPage> {
    const skip = (page - 1) * limit;
    // Only category IDs, names and counts are materialized before pagination.
    const categories = await this.itemModel.aggregate<StockCategoryCount>([
      { $match: filter },
      { $group: { _id: '$categoryId', itemsCount: { $sum: 1 } } },
      { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'category' } },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          itemsCount: 1,
          name: { $ifNull: ['$category.name', ''] },
          createdAt: '$category.createdAt',
          missingCategory: { $cond: [{ $ifNull: ['$category._id', false] }, 0, 1] },
        },
      },
      { $sort: { missingCategory: 1, createdAt: 1, _id: 1 } },
    ]);
    const selectedCategories = categories.slice(skip, skip + limit);
    const selectedIds = selectedCategories.map((category) => category._id);
    const items = selectedIds.length
      ? await this.itemModel
          .find({ ...filter, categoryId: { $in: selectedIds } })
          .select(STOCK_READ_FIELDS)
          .sort({ stockQuantity: 1, createdAt: -1, _id: 1 })
          .lean<StockReadItem[]>()
          .exec()
      : [];
    const categoryOrder = new Map(selectedIds.map((id, index) => [id.toString(), index]));
    items.sort(
      (a, b) =>
        (categoryOrder.get(a.categoryId?.toString() ?? '') ?? 0) -
        (categoryOrder.get(b.categoryId?.toString() ?? '') ?? 0),
    );
    return {
      items,
      categories: new Map(
        selectedCategories
          .filter((category) => category.name)
          .map((category) => [category._id.toString(), { id: category._id.toString(), name: category.name }]),
      ),
      meta: {
        page,
        limit,
        total: categories.length,
        paginationMode: 'categories' as const,
        totalItems: categories.reduce((total, category) => total + category.itemsCount, 0),
        totalPages: Math.max(1, Math.ceil(categories.length / limit)),
      },
    };
  }

  private toStockItemResponse(item: StockReadItem, categories: StockReadPage['categories']): StockItemResponseDto {
    const categoryId = item.categoryId?.toString() ?? '';
    const stock = item.stockQuantity ?? 0;
    const threshold = item.reorderThreshold ?? 0;
    const cost = item.cost ?? 0;
    const unitPrice = item.unitPrice ?? 0;
    const positiveStock = Math.max(stock, 0);
    return {
      id: item._id.toString(),
      name: item.name,
      categoryId,
      category: categories.get(categoryId) ?? null,
      isWood: item.isWood ?? false,
      pricingMode: item.pricingMode,
      unitPrice,
      cost,
      stockQuantity: stock,
      reorderThreshold: threshold,
      isActive: item.isActive ?? true,
      isLowStock: stock > 0 && stock <= threshold,
      isOutOfStock: stock <= 0,
      valuationAtCost: roundMoney(positiveStock * cost),
      valuationAtSellingPrice: roundMoney(positiveStock * unitPrice),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  // 3. Inventory Valuation
  public async getValuation(): Promise<InventoryValuationResponseDto> {
    const filter = { isDeleted: false, isActive: true, pricingMode: { $ne: PricingMode.FREE_AMOUNT } };

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
