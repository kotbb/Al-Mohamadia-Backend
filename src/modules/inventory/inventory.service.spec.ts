import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
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
    code: 'WOOD-01',
    name: 'خشب سويد',
    categoryId: { _id: { toString: () => categoryId }, name: 'أخشاب' },
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
