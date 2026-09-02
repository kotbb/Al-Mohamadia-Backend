import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { SettingsService } from './settings.service';
import { Setting } from './schemas/setting.schema';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../../shared/auth/enums/user-role.enum';
import { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { BALADI_WOOD_METER_PRICE_KEY } from './constants/setting-keys.constant';

describe('SettingsService', () => {
  let service: SettingsService;
  let settingModel: {
    findOne: jest.Mock;
    create: jest.Mock;
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
    username: 'admin',
    role: UserRole.ADMIN,
  };

  beforeEach(async () => {
    session = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn(),
    };

    settingModel = {
      findOne: jest.fn().mockReturnValue({
        exec: () => Promise.resolve(null),
      }),
      create: jest.fn().mockResolvedValue([
        {
          _id: { toString: () => '507f1f77bcf86cd799439014' },
          key: BALADI_WOOD_METER_PRICE_KEY,
          value: 10.56,
          get: (key: string) => (key === 'updatedAt' ? new Date() : undefined),
        },
      ]),
    };

    auditService = { log: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: getModelToken(Setting.name), useValue: settingModel },
        {
          provide: getConnectionToken(),
          useValue: { startSession: jest.fn().mockResolvedValue(session) },
        },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getBaseReferencePrice', () => {
    it('returns null value when setting does not exist', async () => {
      const result = await service.getBaseReferencePrice();

      expect(result).toEqual({
        key: BALADI_WOOD_METER_PRICE_KEY,
        value: null,
      });
    });
  });

  describe('updateBaseReferencePrice', () => {
    it('creates setting and rounds value', async () => {
      const result = await service.updateBaseReferencePrice({ value: 10.556 }, actor);

      expect(settingModel.create).toHaveBeenCalledWith([{ key: BALADI_WOOD_METER_PRICE_KEY, value: 10.56 }], {
        session,
      });
      expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'setting_changed' }), session);
      expect(result.value).toBe(10.56);
    });

    it('updates existing setting', async () => {
      const existing = {
        _id: { toString: () => '507f1f77bcf86cd799439014' },
        key: BALADI_WOOD_METER_PRICE_KEY,
        value: 100,
        save: jest.fn().mockResolvedValue(undefined),
        get: (key: string) => (key === 'updatedAt' ? new Date() : undefined),
      };
      settingModel.findOne.mockReturnValue({
        exec: () => Promise.resolve(existing),
      });

      await service.updateBaseReferencePrice({ value: 120 }, actor);

      expect(existing.value).toBe(120);
      expect(existing.save).toHaveBeenCalledWith({ session });
    });
  });
});
