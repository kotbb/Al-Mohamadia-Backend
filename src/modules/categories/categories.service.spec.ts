import { Item } from '../items/schemas/item.schema';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { CategoriesService } from './categories.service';
import { Category } from './schemas/category.schema';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../../shared/auth/enums/user-role.enum';
import { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let categoryModel: {
    findOne: jest.Mock;
    create: jest.Mock;
    find: jest.Mock;
  };
  const itemModel = { aggregate: jest.fn() };
  let auditService: { log: jest.Mock };
  let connection: {
    startSession: jest.Mock;
    collection: jest.Mock;
  };
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

  const validId = '507f1f77bcf86cd799439011';

  const mockCategory = {
    _id: { toString: () => validId },
    name: 'خشب',
    isActive: true,
    isDeleted: false,
    save: jest.fn().mockResolvedValue(undefined),
    get: (key: string) => (key === 'createdAt' ? new Date() : undefined),
  };

  beforeEach(async () => {
    session = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn(),
    };

    categoryModel = {
      findOne: jest.fn().mockReturnValue({
        lean: () => ({ exec: () => Promise.resolve(null) }),
        exec: () => Promise.resolve({ ...mockCategory }),
      }),
      create: jest.fn().mockResolvedValue([mockCategory]),
      find: jest.fn().mockReturnValue({
        sort: () => ({
          exec: () => Promise.resolve([mockCategory]),
        }),
      }),
    };

    auditService = { log: jest.fn().mockResolvedValue({}) };

    connection = {
      startSession: jest.fn().mockResolvedValue(session),
      collection: jest.fn().mockReturnValue({
        countDocuments: jest.fn().mockResolvedValue(0),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: getModelToken(Item.name), useValue: itemModel },
        { provide: getModelToken(Category.name), useValue: categoryModel },
        { provide: getConnectionToken(), useValue: connection },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates a category and writes audit log', async () => {
      const result = await service.create({ name: 'خشب' }, actor);

      expect(result.name).toBe('خشب');
      expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'category_created' }), session);
      expect(session.commitTransaction).toHaveBeenCalled();
    });

    it('throws ConflictException when name exists', async () => {
      categoryModel.findOne.mockReturnValue({
        lean: () => ({ exec: () => Promise.resolve({ name: 'خشب' }) }),
      });

      await expect(service.create({ name: 'خشب' }, actor)).rejects.toThrow(ConflictException);
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when category missing', async () => {
      categoryModel.findOne.mockReturnValue({
        exec: () => Promise.resolve(null),
      });

      await expect(service.findOne(validId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('softDelete', () => {
    it('throws ConflictException when category has items', async () => {
      connection.collection.mockReturnValue({
        countDocuments: jest.fn().mockResolvedValue(2),
      });

      await expect(service.softDelete(validId, actor)).rejects.toThrow(ConflictException);
    });

    it('soft deletes empty category', async () => {
      const result = await service.softDelete(validId, actor);

      expect(mockCategory.save).toHaveBeenCalledWith({ session });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'category_deleted',
          changes: expect.objectContaining({
            isDeleted: { old: false, new: true },
          }),
        }),
        session,
      );
      expect(result.id).toBe(validId);
    });
  });
  it('only includes item counts when requested, with zero for empty categories', async () => {
    itemModel.aggregate.mockReturnValue({ exec: () => Promise.resolve([{ _id: validId, itemCount: 3 }]) });
    const rows = await service.findAll(true);
    expect(rows[0]).toHaveProperty('itemCount', 3);
    expect(itemModel.aggregate).toHaveBeenCalledWith([
      { $match: { isDeleted: false, categoryId: { $in: [mockCategory._id] } } },
      { $group: { _id: '$categoryId', itemCount: { $sum: 1 } } },
    ]);
    itemModel.aggregate.mockReturnValue({ exec: () => Promise.resolve([]) });
    expect((await service.findAll(true))[0]).toHaveProperty('itemCount', 0);
    itemModel.aggregate.mockClear();
    expect((await service.findAll())[0]).not.toHaveProperty('itemCount');
    expect(itemModel.aggregate).not.toHaveBeenCalled();
    categoryModel.find.mockReturnValue({ sort: () => ({ exec: () => Promise.resolve([]) }) });
    expect(await service.findAll(true)).toEqual([]);
    expect(itemModel.aggregate).not.toHaveBeenCalled();
  });
});
