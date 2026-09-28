import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User } from './schemas/user.schema';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../../shared/auth/enums/user-role.enum';
import { RolesGuard } from '../../shared/auth/guards/roles/roles.guard';
import { ROLES_KEY } from '../../shared/auth/decorators/roles.decorator';
import { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';

describe('UsersService createAdmin', () => {
  let service: UsersService;
  let userModel: {
    findOne: jest.Mock;
    create: jest.Mock;
    find: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let session: {
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    abortTransaction: jest.Mock;
    endSession: jest.Mock;
  };

  const actor: AuthUser = {
    id: '507f1f77bcf86cd799439099',
    username: 'super',
    role: UserRole.SUPER_ADMIN,
  };

  const validId = '507f1f77bcf86cd799439011';

  beforeEach(async () => {
    session = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn(),
    };

    userModel = {
      findOne: jest.fn().mockReturnValue({
        lean: () => ({ exec: () => Promise.resolve(null) }),
        exec: () => Promise.resolve(null),
      }),
      create: jest.fn().mockResolvedValue([
        {
          _id: { toString: () => validId },
          username: 'newadmin',
          firstName: 'New',
          lastName: 'Admin',
          role: UserRole.ADMIN,
          isActive: true,
          isDeleted: false,
          get: (key: string) => (key === 'createdAt' ? new Date() : undefined),
        },
      ]),
      find: jest.fn().mockReturnValue({
        sort: () => ({
          exec: () => Promise.resolve([]),
        }),
      }),
    };

    auditService = { log: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken(User.name), useValue: userModel },
        {
          provide: getConnectionToken(),
          useValue: { startSession: jest.fn().mockResolvedValue(session) },
        },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  it('creates an admin and writes audit_created', async () => {
    const result = await service.createAdmin(
      { username: 'newadmin', firstName: 'New', lastName: 'Admin', password: 'password123' },
      actor,
    );

    expect(result.role).toBe(UserRole.ADMIN);
    expect(result.username).toBe('newadmin');
    expect(result.firstName).toBe('New');
    expect(result.lastName).toBe('Admin');
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin_created',
        entityType: 'User',
      }),
      session,
    );
    expect(session.commitTransaction).toHaveBeenCalled();
  });

  it('rejects duplicate usernames', async () => {
    userModel.findOne.mockReturnValue({
      lean: () => ({
        exec: () => Promise.resolve({ username: 'newadmin' }),
      }),
    });

    await expect(
      service.createAdmin(
        { username: 'newadmin', firstName: 'New', lastName: 'Admin', password: 'password123' },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('UsersService findMe', () => {
  let service: UsersService;
  let userModel: { findOne: jest.Mock };

  const validId = '507f1f77bcf86cd799439011';

  beforeEach(async () => {
    userModel = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getConnectionToken(), useValue: { startSession: jest.fn() } },
        { provide: AuditService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  it('returns the current user', async () => {
    userModel.findOne.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: { toString: () => validId },
          username: 'super',
          role: UserRole.SUPER_ADMIN,
          isActive: true,
          isDeleted: false,
          get: () => undefined,
        }),
    });

    const result = await service.findMe(validId);
    expect(result).toEqual(
      expect.objectContaining({
        id: validId,
        username: 'super',
        role: UserRole.SUPER_ADMIN,
      }),
    );
  });

  it('throws NotFoundException when user is missing', async () => {
    userModel.findOne.mockReturnValue({
      exec: () => Promise.resolve(null),
    });

    await expect(service.findMe(validId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws BadRequestException for invalid ObjectId', async () => {
    await expect(service.findMe('bad-id')).rejects.toBeInstanceOf(BadRequestException);
    expect(userModel.findOne).not.toHaveBeenCalled();
  });
});

describe('UsersService updateUser', () => {
  let service: UsersService;
  let userModel: { findOne: jest.Mock };
  let auditService: { log: jest.Mock };

  const validId = '507f1f77bcf86cd799439011';
  const actor: AuthUser = {
    id: '507f1f77bcf86cd799439099',
    username: 'super',
    role: UserRole.SUPER_ADMIN,
  };

  beforeEach(async () => {
    userModel = {
      findOne: jest.fn(),
    };
    auditService = { log: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getConnectionToken(), useValue: { startSession: jest.fn() } },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  it('deactivates an existing user', async () => {
    const doc = {
      _id: { toString: () => validId },
      username: 'admin1',
      firstName: 'A',
      lastName: 'B',
      role: UserRole.ADMIN,
      isActive: true,
      isDeleted: false,
      save: jest.fn().mockResolvedValue(undefined),
      get: () => undefined,
    };
    userModel.findOne.mockReturnValue({
      exec: () => Promise.resolve(doc),
    });

    const result = await service.updateUser(validId, { isActive: false }, actor);

    expect(doc.isActive).toBe(false);
    expect(doc.save).toHaveBeenCalled();
    expect(result.isActive).toBe(false);
  });

  it('throws NotFoundException when user is missing', async () => {
    userModel.findOne.mockReturnValue({
      exec: () => Promise.resolve(null),
    });

    await expect(service.updateUser(validId, { isActive: false }, actor)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('changes an admin role and records the audit diff', async () => {
    const doc = {
      _id: { toString: () => validId },
      username: 'admin1',
      firstName: 'A',
      lastName: 'B',
      role: UserRole.ADMIN,
      isActive: true,
      isDeleted: false,
      save: jest.fn().mockResolvedValue(undefined),
      get: () => undefined,
    };
    userModel.findOne.mockReturnValue({
      exec: () => Promise.resolve(doc),
    });

    const result = await service.updateUser(validId, { role: UserRole.SUPER_ADMIN }, actor);

    expect(doc.role).toBe(UserRole.SUPER_ADMIN);
    expect(result.role).toBe(UserRole.SUPER_ADMIN);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin_updated',
        changes: {
          role: { old: UserRole.ADMIN, new: UserRole.SUPER_ADMIN },
        },
      }),
    );
  });

  it('rejects changing your own role', async () => {
    const doc = {
      _id: { toString: () => actor.id },
      username: 'super',
      firstName: 'A',
      lastName: 'B',
      role: UserRole.ADMIN,
      isActive: true,
      isDeleted: false,
      save: jest.fn(),
      get: () => undefined,
    };
    userModel.findOne.mockReturnValue({
      exec: () => Promise.resolve(doc),
    });

    await expect(service.updateUser(actor.id, { role: UserRole.SUPER_ADMIN }, actor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(doc.save).not.toHaveBeenCalled();
  });

  it('lets a super admin change another super admin role', async () => {
    const doc = {
      _id: { toString: () => validId },
      username: 'super2',
      firstName: 'A',
      lastName: 'B',
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      isDeleted: false,
      save: jest.fn().mockResolvedValue(undefined),
      get: () => undefined,
    };
    userModel.findOne.mockReturnValue({
      exec: () => Promise.resolve(doc),
    });

    const result = await service.updateUser(validId, { role: UserRole.ADMIN }, actor);

    expect(result.role).toBe(UserRole.ADMIN);
    expect(doc.save).toHaveBeenCalled();
  });
});

describe('UsersController role metadata', () => {
  it('marks create, getAll, update, and remove as super_admin only', () => {
    expect(Reflect.getMetadata(ROLES_KEY, UsersController.prototype.create)).toEqual([UserRole.SUPER_ADMIN]);
    expect(Reflect.getMetadata(ROLES_KEY, UsersController.prototype.getAll)).toEqual([UserRole.SUPER_ADMIN]);
    expect(Reflect.getMetadata(ROLES_KEY, UsersController.prototype.update)).toEqual([UserRole.SUPER_ADMIN]);
    expect(Reflect.getMetadata(ROLES_KEY, UsersController.prototype.remove)).toEqual([UserRole.SUPER_ADMIN]);
  });

  it('allows admin and super_admin for getMe', () => {
    expect(Reflect.getMetadata(ROLES_KEY, UsersController.prototype.getMe)).toEqual([
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
    ]);
  });
});

describe('RolesGuard denies admin creating users', () => {
  it('throws ForbiddenException for admin role', () => {
    const reflector = new Reflector();
    const guard = new RolesGuard(reflector);
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.SUPER_ADMIN]);

    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: UserRole.ADMIN } }),
      }),
    } as never;

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
