import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { ItemsService } from './items.service';
import { Item } from './schemas/item.schema';
import { ItemPriceHistory } from './schemas/item-price-history.schema';
import { AuditService } from '../audit/audit.service';
import { CategoriesService } from '../categories/categories.service';
import { UserRole } from '../../shared/auth/enums/user-role.enum';
import { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { PricingMode } from '../../shared/enums/pricing-mode.enum';

describe('ItemsService', () => {
  let service: ItemsService;
  let itemModel: {
    findOne: jest.Mock;
    create: jest.Mock;
    find: jest.Mock;
  };
  let priceHistoryModel: {
    create: jest.Mock;
    find: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let categoriesService: { findActiveById: jest.Mock };
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

  const categoryId = '507f1f77bcf86cd799439012';
  const validId = '507f1f77bcf86cd799439011';

  const mockItem = {
    _id: { toString: () => validId },
    name: 'لوح MDF',
    categoryId: {
      _id: { toString: () => categoryId },
      name: 'خشب',
    },
    isWood: true,
    pricingMode: PricingMode.PER_PIECE,
    unitPrice: 100,
    cost: 80,
    stockQuantity: 10,
    reorderThreshold: 2,
    isActive: true,
    isDeleted: false,
    save: jest.fn().mockResolvedValue(undefined),
    populate: jest.fn().mockResolvedValue(undefined),
    get: (key: string) => (key === 'createdAt' ? new Date() : undefined),
  };

  beforeEach(async () => {
    session = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn(),
    };

    itemModel = {
      findOne: jest.fn().mockReturnValue({
        lean: () => ({ exec: () => Promise.resolve(null) }),
        populate: () => ({
          exec: () => Promise.resolve({ ...mockItem }),
        }),
        exec: () => Promise.resolve({ ...mockItem }),
      }),
      create: jest.fn().mockResolvedValue([
        {
          ...mockItem,
          populate: jest.fn().mockResolvedValue(mockItem),
        },
      ]),
      find: jest.fn().mockReturnValue({
        populate: () => ({
          sort: () => ({
            exec: () => Promise.resolve([mockItem]),
          }),
        }),
      }),
    };

    priceHistoryModel = {
      create: jest.fn().mockResolvedValue([{ _id: { toString: () => '507f1f77bcf86cd799439013' } }]),
      find: jest.fn().mockReturnValue({
        sort: () => ({
          exec: () => Promise.resolve([]),
        }),
      }),
    };

    auditService = { log: jest.fn().mockResolvedValue({}) };
    categoriesService = {
      findActiveById: jest.fn().mockResolvedValue({ _id: categoryId, name: 'خشب' }),
    };

    connection = {
      startSession: jest.fn().mockResolvedValue(session),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ItemsService,
        { provide: getModelToken(Item.name), useValue: itemModel },
        { provide: getModelToken(ItemPriceHistory.name), useValue: priceHistoryModel },
        { provide: getConnectionToken(), useValue: connection },
        { provide: AuditService, useValue: auditService },
        { provide: CategoriesService, useValue: categoriesService },
      ],
    }).compile();

    service = module.get<ItemsService>(ItemsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates a free-amount item with zero valued physical and pricing fields', async () => {
      await service.create({ name: 'تصنيع', categoryId, pricingMode: PricingMode.FREE_AMOUNT }, actor);
      expect(itemModel.create).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            pricingMode: PricingMode.FREE_AMOUNT,
            isWood: false,
            unitPrice: 0,
            cost: 0,
            stockQuantity: 0,
            reorderThreshold: 0,
          }),
        ],
        { session },
      );
    });

    it('rejects physical and pricing fields on free-amount items', async () => {
      await expect(
        service.create({ name: 'تصنيع', categoryId, pricingMode: PricingMode.FREE_AMOUNT, stockQuantity: 2 }, actor),
      ).rejects.toThrow(BadRequestException);
      expect(itemModel.create).not.toHaveBeenCalled();
    });
    it('creates an item and writes audit log', async () => {
      const result = await service.create(
        {
          name: 'لوح MDF',
          categoryId,
          pricingMode: PricingMode.PER_PIECE,
        },
        actor,
      );

      expect(result).not.toHaveProperty('code');
      expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'item_created' }), session);
    });

    it('throws NotFoundException when category missing', async () => {
      categoriesService.findActiveById.mockResolvedValue(null);

      await expect(
        service.create(
          {
            name: 'لوح MDF',
            categoryId,
            pricingMode: PricingMode.PER_PIECE,
          },
          actor,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('does not query for duplicate codes or names during creation', async () => {
      await service.create({ name: 'Repeated name', categoryId, pricingMode: PricingMode.PER_PIECE }, actor);
      expect(itemModel.findOne).not.toHaveBeenCalled();
      expect(itemModel.create).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when item missing', async () => {
      itemModel.findOne.mockReturnValue({
        populate: () => ({
          exec: () => Promise.resolve(null),
        }),
      });

      await expect(service.findOne(validId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('rejects changing pricing mode after item creation', async () => {
      await expect(service.update(validId, { pricingMode: PricingMode.FREE_AMOUNT }, actor)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockItem.save).not.toHaveBeenCalled();
    });

    it('rejects physical fields on a free-amount item', async () => {
      itemModel.findOne.mockReturnValue({
        populate: () => ({ exec: () => Promise.resolve({ ...mockItem, pricingMode: PricingMode.FREE_AMOUNT }) }),
      });
      await expect(service.update(validId, { reorderThreshold: 2 }, actor)).rejects.toThrow(BadRequestException);
    });
  });

  describe('updatePricing', () => {
    it('rejects pricing changes for a free-amount item', async () => {
      itemModel.findOne.mockReturnValue({
        exec: () => Promise.resolve({ ...mockItem, pricingMode: PricingMode.FREE_AMOUNT }),
      });
      await expect(service.updatePricing(validId, { unitPrice: 100 }, actor)).rejects.toThrow(BadRequestException);
    });
    it('throws BadRequestException when no fields provided', async () => {
      await expect(service.updatePricing(validId, {}, actor)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when values unchanged', async () => {
      await expect(service.updatePricing(validId, { unitPrice: 100 }, actor)).rejects.toThrow(BadRequestException);
    });

    it('creates price history and audit log when unitPrice changes', async () => {
      const result = await service.updatePricing(validId, { unitPrice: 150 }, actor);

      expect(priceHistoryModel.create).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'price_changed',
          changes: { unitPrice: { old: 100, new: 150 } },
          refCollection: 'ItemPriceHistory',
        }),
        session,
      );
      expect(result.unitPrice).toBe(150);
    });
  });
});
