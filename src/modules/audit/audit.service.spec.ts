import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { ROLES_KEY } from '../../shared/auth/decorators/roles.decorator';
import { UserRole } from '../../shared/auth/enums/user-role.enum';
import { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { cairoInclusiveDateBounds } from '../../shared/utils/period/cairo-period.util';
import { User } from '../users/schemas/user.schema';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';
import { AuditLog } from './schemas/audit-log.schema';

const userId = '65f1a2b3c4d5e6f7a8b9c0d1';
const entityId = '65f1a2b3c4d5e6f7a8b9c0d2';
const logId = '65f1a2b3c4d5e6f7a8b9c0d3';
const superAdmin: AuthUser = {
  id: '65f1a2b3c4d5e6f7a8b9c0e1',
  username: 'superadmin',
  role: UserRole.SUPER_ADMIN,
};
const admin: AuthUser = {
  id: userId,
  username: 'shop',
  role: UserRole.ADMIN,
};

describe('AuditService', () => {
  let service: AuditService;
  let mockSave: jest.Mock;

  const mockAuditLogModel = Object.assign(
    jest.fn().mockImplementation((dto: CreateAuditLogDto) => ({
      ...dto,
      save: (...args: unknown[]) => mockSave(...args),
    })),
    {
      find: jest.fn(),
      countDocuments: jest.fn(),
      distinct: jest.fn(),
    },
  );

  const mockUserModel = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    mockSave = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: getModelToken(AuditLog.name),
          useValue: mockAuditLogModel,
        },
        {
          provide: getModelToken(User.name),
          useValue: mockUserModel,
        },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('log', () => {
    it('should create and save an audit log document', async () => {
      const dto: CreateAuditLogDto = {
        userId,
        action: 'item_created',
        entityType: 'Item',
        entityId,
        summary: 'Created new wood item',
      };

      const expectedSavedDoc = { ...dto, _id: logId };
      mockSave.mockResolvedValue(expectedSavedDoc);

      const result = await service.log(dto);

      expect(mockAuditLogModel).toHaveBeenCalledWith(dto);
      expect(mockSave).toHaveBeenCalledWith({ session: undefined });
      expect(result).toEqual(expectedSavedDoc);
    });

    it('should pass session to save if session is provided', async () => {
      const dto: CreateAuditLogDto = {
        userId,
        action: 'invoice_cancelled',
        entityType: 'SalesInvoice',
        entityId: '65f1a2b3c4d5e6f7a8b9c0d4',
      };

      const mockSession = {} as never;
      mockSave.mockResolvedValue({ ...dto });

      await service.log(dto, mockSession);

      expect(mockSave).toHaveBeenCalledWith({ session: mockSession });
    });
  });

  describe('findAll', () => {
    const createdAt = new Date('2026-03-15T10:00:00.000Z');

    function makeLog(overrides: Record<string, unknown> = {}) {
      return {
        _id: { toString: () => logId },
        userId: { toString: () => userId },
        action: 'invoice_created',
        entityType: 'SalesInvoice',
        entityId: { toString: () => entityId },
        summary: 'Invoice created: INV-0001',
        changes: null,
        refCollection: null,
        refId: null,
        get: (key: string) => (key === 'createdAt' ? createdAt : undefined),
        ...overrides,
      };
    }

    function mockList(docs: unknown[], total: number) {
      const chain = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(docs),
      };
      mockAuditLogModel.find.mockReturnValue(chain);
      mockAuditLogModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(total),
      });
      return chain;
    }

    function mockUsers(users: { id: string; username: string }[]) {
      mockUserModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(
            users.map((user) => ({
              _id: { toString: () => user.id },
              username: user.username,
            })),
          ),
        }),
      });
    }

    it('filters, applies Cairo bounds, and paginates newest first', async () => {
      const chain = mockList([makeLog()], 1);
      mockUsers([{ id: userId, username: 'shop' }]);

      const query: ListAuditLogsQueryDto = {
        userId,
        action: 'invoice_created',
        entityType: 'SalesInvoice',
        entityId,
        from: '2026-03-01',
        to: '2026-03-15',
        page: 2,
        limit: 10,
      };

      const result = await service.findAll(query, superAdmin);
      const bounds = cairoInclusiveDateBounds(query.from, query.to);
      const filter = mockAuditLogModel.find.mock.calls[0][0] as {
        userId: Types.ObjectId;
        action: string;
        entityType: string;
        entityId: Types.ObjectId;
        createdAt: { $gte: Date; $lt: Date };
      };

      expect(filter.userId.toString()).toBe(userId);
      expect(filter.action).toBe('invoice_created');
      expect(filter.entityType).toBe('SalesInvoice');
      expect(filter.entityId.toString()).toBe(entityId);
      expect(filter.createdAt).toEqual({ $gte: bounds.gte, $lt: bounds.lt });
      expect(mockAuditLogModel.countDocuments).toHaveBeenCalledWith(filter);
      expect(chain.sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(chain.skip).toHaveBeenCalledWith(10);
      expect(chain.limit).toHaveBeenCalledWith(10);
      expect(result.meta).toEqual({ page: 2, limit: 10, total: 1 });
      expect(result.items[0]).toEqual({
        id: logId,
        createdAt,
        user: { id: userId, username: 'shop' },
        action: 'invoice_created',
        entityType: 'SalesInvoice',
        entityId,
        summary: 'Invoice created: INV-0001',
        changes: null,
        refCollection: null,
        refId: null,
      });
    });

    it('throws BadRequestException when from is after to', async () => {
      await expect(service.findAll({ from: '2026-03-20', to: '2026-03-01' }, superAdmin)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mockAuditLogModel.find).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for an impossible calendar date', async () => {
      await expect(service.findAll({ from: '2026-02-31' }, superAdmin)).rejects.toBeInstanceOf(BadRequestException);
      expect(mockAuditLogModel.find).not.toHaveBeenCalled();
    });

    it('keeps a row when the user document is missing', async () => {
      mockList([makeLog()], 1);
      mockUsers([]);

      const result = await service.findAll({ page: 1, limit: 20 }, superAdmin);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].user).toEqual({ id: userId, username: null });
    });

    it('rejects an admin filtering by another user', async () => {
      await expect(service.findAll({ userId: superAdmin.id }, admin)).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockAuditLogModel.find).not.toHaveBeenCalled();
    });

    it('rejects an admin filtering by the User entity', async () => {
      await expect(service.findAll({ entityType: 'User' }, admin)).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockAuditLogModel.find).not.toHaveBeenCalled();
    });

    it('rejects an admin filtering by a user-management action', async () => {
      await expect(service.findAll({ action: 'admin_created' }, admin)).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockAuditLogModel.find).not.toHaveBeenCalled();
    });

    it('allows an admin to filter their own entries', async () => {
      mockList([], 0);

      await service.findAll({ userId: admin.id, entityType: 'Customer' }, admin);

      const filter = mockAuditLogModel.find.mock.calls[0][0] as { userId: Types.ObjectId; entityType: string };
      expect(filter.userId.toString()).toBe(admin.id);
      expect(filter.entityType).toBe('Customer');
    });

    it('returns an empty page past the end with the filtered total', async () => {
      const chain = mockList([], 5);

      const result = await service.findAll({ page: 3, limit: 20 }, superAdmin);

      expect(chain.skip).toHaveBeenCalledWith(40);
      expect(result.items).toEqual([]);
      expect(result.meta).toEqual({ page: 3, limit: 20, total: 5 });
      expect(mockUserModel.find).not.toHaveBeenCalled();
    });
  });

  describe('listActors', () => {
    function mockDistinct(ids: string[]) {
      mockAuditLogModel.distinct.mockReturnValue({
        exec: jest.fn().mockResolvedValue(ids.map((id) => ({ toString: () => id }))),
      });
    }

    it('returns an empty array when there are no logs', async () => {
      mockDistinct([]);

      await expect(service.listActors()).resolves.toEqual([]);
      expect(mockUserModel.find).not.toHaveBeenCalled();
    });

    it('returns distinct users, keeps soft-deleted usernames, and sorts nulls first', async () => {
      const missingId = '65f1a2b3c4d5e6f7a8b9c0d9';
      const deletedId = '65f1a2b3c4d5e6f7a8b9c0d8';
      const activeId = '65f1a2b3c4d5e6f7a8b9c0d7';
      mockDistinct([activeId, missingId, deletedId]);

      const select = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          { _id: { toString: () => activeId }, username: 'zara' },
          { _id: { toString: () => deletedId }, username: 'amina' },
        ]),
      });
      mockUserModel.find.mockReturnValue({ select });

      const result = await service.listActors();

      expect(mockAuditLogModel.distinct).toHaveBeenCalledWith('userId');
      const lookup = mockUserModel.find.mock.calls[0][0] as { _id: { $in: { toString: () => string }[] } };
      expect(lookup._id.$in.map((id) => id.toString())).toEqual([activeId, missingId, deletedId]);
      expect(lookup).not.toHaveProperty('isDeleted');
      expect(select).toHaveBeenCalledWith('username');
      expect(result).toEqual([
        { id: missingId, username: null },
        { id: deletedId, username: 'amina' },
        { id: activeId, username: 'zara' },
      ]);
    });
  });
});

describe('AuditController role metadata', () => {
  it('allows admin and super_admin', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AuditController)).toEqual([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  });
});
