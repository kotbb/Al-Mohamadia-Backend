import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { UserRole } from '../../shared/auth/enums/user-role.enum';
import { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { PricingMode } from '../../shared/enums/pricing-mode.enum';
import { AuditService } from '../audit/audit.service';
import { Category } from '../categories/schemas/category.schema';
import { Item } from '../items/schemas/item.schema';
import { CreateStockAdjustmentDto } from './dto/request/create-stock-adjustment.dto';
import { ListStockQueryDto } from './dto/request/list-stock-query.dto';
import { StockStatusFilter } from './enums/stock-status-filter.enum';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  let service: InventoryService;
  let itemModel: {
    findOne: jest.Mock;
    find: jest.Mock;
    countDocuments: jest.Mock;
    aggregate: jest.Mock;
  };
  let categoryModel: {
    findOne: jest.Mock;
    find: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let connection: { startSession: jest.Mock };
  let session: {
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    abortTransaction: jest.Mock;
    endSession: jest.Mock;
  };

  const actor: AuthUser = {
    id: '507f1f77bcf86cd799439099',
    username: 'admin',
    role: UserRole.ADMIN,
  };

  const itemId = '507f1f77bcf86cd799439011';
  const categoryId = '507f1f77bcf86cd799439022';

  const makeItem = (overrides: Record<string, unknown> = {}) => ({
    _id: { toString: () => itemId },
    name: 'خشب سويد',
    categoryId: new Types.ObjectId(categoryId),
    isWood: true,
    pricingMode: PricingMode.PER_PIECE,
    unitPrice: 150,
    cost: 100,
    stockQuantity: 10,
    reorderThreshold: 5,
    isActive: true,
    isDeleted: false,
    save: jest.fn().mockResolvedValue(undefined),
    get: (key: string) => (key === 'createdAt' || key === 'updatedAt' ? new Date() : undefined),
    ...overrides,
  });

  const mockQuery = <T>(val: T) => ({
    session: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(val),
  });

  beforeEach(async () => {
    session = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn(),
    };

    connection = {
      startSession: jest.fn().mockResolvedValue(session),
    };

    itemModel = {
      findOne: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
      aggregate: jest.fn(),
    };

    categoryModel = {
      findOne: jest.fn(),
      find: jest.fn().mockReturnValue(mockQuery([{ _id: new Types.ObjectId(categoryId), name: 'أخشاب' }])),
    };

    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: getModelToken(Item.name), useValue: itemModel },
        { provide: getModelToken(Category.name), useValue: categoryModel },
        { provide: getConnectionToken(), useValue: connection },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
  });

  describe('adjustStock', () => {
    it('rejects stock adjustments for a free-amount item', async () => {
      itemModel.findOne.mockReturnValue(mockQuery(makeItem({ pricingMode: PricingMode.FREE_AMOUNT })));
      await expect(service.adjustStock({ itemId, newQuantity: 1, reason: 'test' }, actor)).rejects.toThrow(
        BadRequestException,
      );
      expect(connection.startSession).not.toHaveBeenCalled();
    });
    it('updates item stock and writes a stock_adjusted audit row', async () => {
      const item = makeItem({ stockQuantity: 10 });
      itemModel.findOne.mockReturnValue(mockQuery(item));

      const dto: CreateStockAdjustmentDto = {
        itemId,
        newQuantity: 15,
        reason: 'جرد فعلي في المخزن',
      };

      const result = await service.adjustStock(dto, actor);

      expect(result.itemId).toBe(itemId);
      expect(result.oldQuantity).toBe(10);
      expect(result.newQuantity).toBe(15);
      expect(result.reason).toBe('جرد فعلي في المخزن');

      expect(item.stockQuantity).toBe(15);
      expect(item.save).toHaveBeenCalledWith({ session });

      expect(auditService.log).toHaveBeenCalledWith(
        {
          userId: actor.id,
          action: 'stock_adjusted',
          entityType: 'Item',
          entityId: itemId,
          changes: {
            stockQuantity: { old: 10, new: 15 },
            reason: { old: null, new: 'جرد فعلي في المخزن' },
          },
          refCollection: null,
          refId: null,
          summary: 'Stock adjusted: خشب سويد',
        },
        session,
      );

      expect(session.commitTransaction).toHaveBeenCalled();
    });

    it('fails if item is not found', async () => {
      itemModel.findOne.mockReturnValue(mockQuery(null));

      const dto: CreateStockAdjustmentDto = {
        itemId,
        newQuantity: 15,
        reason: 'جرد',
      };

      await expect(service.adjustStock(dto, actor)).rejects.toThrow(NotFoundException);
    });

    it('fails if new quantity equals current quantity', async () => {
      const item = makeItem({ stockQuantity: 10 });
      itemModel.findOne.mockReturnValue(mockQuery(item));

      const dto: CreateStockAdjustmentDto = {
        itemId,
        newQuantity: 10,
        reason: 'نفس الكمية',
      };

      await expect(service.adjustStock(dto, actor)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getStockList', () => {
    const categoryRows = () =>
      ['Zinc', 'خشب', 'Alpha', 'Beta', 'Gamma', 'Delta'].map((name, index) => ({
        _id: new Types.ObjectId(`507f1f77bcf86cd7994390${index.toString().padStart(2, '0')}`),
        name,
        itemsCount: index === 0 ? 30 : 1,
      }));

    it('pages complete categories in database creation order without an item limit', async () => {
      const rows = categoryRows();
      const selected = rows.slice(0, 5);
      const raw = selected.flatMap((category) =>
        Array.from({ length: category.itemsCount }, () => makeItem({ categoryId: category._id })),
      );
      const findQuery = mockQuery(raw.reverse());
      itemModel.find.mockReturnValue(findQuery);
      itemModel.aggregate.mockResolvedValueOnce(rows).mockResolvedValueOnce([]);
      const result = await service.getStockList({ paginationMode: 'categories' });
      expect(result.meta).toEqual({
        page: 1,
        limit: 5,
        total: 6,
        paginationMode: 'categories',
        totalItems: 35,
        totalPages: 2,
      });
      expect(result.items).toHaveLength(selected.reduce((sum, category) => sum + category.itemsCount, 0));
      expect([...new Set(result.items.map((item) => item.category?.name))]).toEqual(
        selected.map((category) => category.name),
      );
      expect(itemModel.aggregate.mock.calls[0][0]).toContainEqual({
        $sort: { missingCategory: 1, createdAt: 1, _id: 1 },
      });
      expect(findQuery.lean).toHaveBeenCalled();
      expect(findQuery.populate).not.toHaveBeenCalled();
      expect(categoryModel.find).not.toHaveBeenCalled();
      expect(findQuery.limit).not.toHaveBeenCalled();
      expect(findQuery.skip).not.toHaveBeenCalled();
      expect(findQuery.sort).toHaveBeenCalledWith({ stockQuantity: 1, createdAt: -1, _id: 1 });
      expect(itemModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: { $in: selected.map((category) => category._id) } }),
      );
    });

    it('filters matching categories before paging and keeps KPI status counts independent', async () => {
      itemModel.aggregate
        .mockResolvedValueOnce(categoryRows().slice(0, 1))
        .mockResolvedValueOnce([{ totalItems: 40, normalStockCount: 10 }]);
      itemModel.find.mockReturnValue(mockQuery([]));
      const result = await service.getStockList({
        paginationMode: 'categories',
        categoryId,
        q: 'A.*',
        stockStatus: StockStatusFilter.NEGATIVE_STOCK,
      });
      const groupPipeline = itemModel.aggregate.mock.calls[0][0] as Array<{ $match?: Record<string, unknown> }>;
      const kpiPipeline = itemModel.aggregate.mock.calls[1][0] as Array<{ $match?: Record<string, unknown> }>;
      expect(groupPipeline[0].$match).toMatchObject({
        categoryId: new Types.ObjectId(categoryId),
        stockQuantity: { $lt: 0 },
        pricingMode: { $ne: PricingMode.FREE_AMOUNT },
        name: { $regex: 'A\\.\\*', $options: 'i' },
      });
      expect(kpiPipeline[0].$match).not.toHaveProperty('stockQuantity');
      expect(result.summary.totalItems).toBe(40);
    });

    it.each([{ rows: [] }, { rows: categoryRows() }])(
      'returns empty items for empty or out of range category pages',
      async ({ rows }) => {
        itemModel.aggregate.mockResolvedValueOnce(rows).mockResolvedValueOnce([]);
        const result = await service.getStockList({ paginationMode: 'categories', page: 20 });
        expect(result.items).toEqual([]);
        expect(result.meta.total).toBe(rows.length);
        expect(result.meta.totalPages).toBe(rows.length ? 2 : 1);
        expect(itemModel.find).not.toHaveBeenCalled();
      },
    );

    it('preserves legacy item pagination defaults and metadata, including orphan categories', async () => {
      const findQuery = mockQuery([makeItem({ categoryId: null })]);
      itemModel.find.mockReturnValue(findQuery);
      itemModel.countDocuments.mockReturnValue(mockQuery(26));
      itemModel.aggregate.mockResolvedValue([]);
      const result = await service.getStockList({});
      expect(result.meta).toEqual({ page: 1, limit: 10, total: 26 });
      expect(findQuery.limit).toHaveBeenCalledWith(10);
      expect(result.items[0].category).toBeNull();
    });

    it('maps projected plain records, dates and schema defaults without document methods', async () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-01-02T00:00:00Z');
      const item = {
        _id: new Types.ObjectId(itemId),
        categoryId: new Types.ObjectId(categoryId),
        name: 'Lean stock',
        pricingMode: PricingMode.PER_PIECE,
        createdAt,
        updatedAt,
      };
      const findQuery = mockQuery([item]);
      itemModel.find.mockReturnValue(findQuery);
      itemModel.countDocuments.mockReturnValue(mockQuery(1));
      itemModel.aggregate.mockResolvedValue([]);
      const result = await service.getStockList({});
      expect(findQuery.lean).toHaveBeenCalled();
      expect(findQuery.populate).not.toHaveBeenCalled();
      expect(findQuery.select.mock.calls[0][0]).not.toContain('dimensionDefaults');
      expect(result.items[0]).toMatchObject({
        id: itemId,
        categoryId,
        category: { id: categoryId, name: 'أخشاب' },
        createdAt,
        updatedAt,
        stockQuantity: 0,
        reorderThreshold: 0,
        unitPrice: 0,
        cost: 0,
        valuationAtCost: 0,
        valuationAtSellingPrice: 0,
        isWood: false,
        isActive: true,
        isOutOfStock: true,
      });
    });

    it('returns paginated stock list with computed flags and KPI summary cards', async () => {
      const normalItem = makeItem({ stockQuantity: 20, reorderThreshold: 5 });
      const lowStockItem = makeItem({ _id: { toString: () => 'item2' }, stockQuantity: 3, reorderThreshold: 5 });
      const outOfStockItem = makeItem({ _id: { toString: () => 'item3' }, stockQuantity: 0, reorderThreshold: 5 });
      const negativeStockItem = makeItem({ _id: { toString: () => 'item4' }, stockQuantity: -2, reorderThreshold: 5 });

      itemModel.find.mockReturnValue(mockQuery([normalItem, lowStockItem, outOfStockItem, negativeStockItem]));
      itemModel.countDocuments.mockReturnValue(mockQuery(4));
      itemModel.aggregate.mockResolvedValue([
        {
          totalItems: 4,
          lowStockCount: 1,
          outOfStockCount: 1,
          negativeStockCount: 1,
          normalStockCount: 1,
        },
      ]);

      const query: ListStockQueryDto = {
        stockStatus: StockStatusFilter.ALL,
        page: 1,
        limit: 20,
      };

      const result = await service.getStockList(query);

      expect(itemModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ pricingMode: { $ne: PricingMode.FREE_AMOUNT } }),
      );

      expect(result.items.length).toBe(4);
      expect(result.summary.totalItems).toBe(4);
      expect(result.summary.lowStockCount).toBe(1);
      expect(result.summary.outOfStockCount).toBe(1);
      expect(result.summary.negativeStockCount).toBe(1);
      expect(result.summary.normalStockCount).toBe(1);

      // Verify computed flags
      expect(result.items[0].isLowStock).toBe(false);
      expect(result.items[1].isLowStock).toBe(true);
      expect(result.items[2].isOutOfStock).toBe(true);
      expect(result.items[3].isNegativeStock).toBe(true);
    });
  });

  describe('getValuation', () => {
    it('calculates inventory valuation at cost, at selling price, and category breakdown', async () => {
      itemModel.aggregate
        .mockResolvedValueOnce([
          {
            totalItemsCount: 2,
            totalValuationAtCost: 15000,
            totalValuationAtSellingPrice: 20000,
          },
        ])
        .mockResolvedValueOnce([
          {
            _id: { toString: () => categoryId },
            categoryName: 'أخشاب',
            itemsCount: 2,
            valuationAtCost: 15000,
            valuationAtSellingPrice: 20000,
          },
        ]);

      const result = await service.getValuation();

      expect(result.totalItemsCount).toBe(2);
      expect(result.totalValuationAtCost).toBe(15000);
      expect(result.totalValuationAtSellingPrice).toBe(20000);
      expect(result.potentialProfit).toBe(5000);
      expect(result.categories.length).toBe(1);
      expect(result.categories[0].categoryName).toBe('أخشاب');
    });
  });
});
