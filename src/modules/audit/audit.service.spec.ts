import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { AuditService } from './audit.service';
import { AuditLog } from './schemas/audit-log.schema';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';

describe('AuditService', () => {
  let service: AuditService;
  let mockSave: jest.Mock;

  const mockAuditLogModel = jest.fn().mockImplementation((dto) => ({
    ...dto,
    save: mockSave,
  }));

  beforeEach(async () => {
    mockSave = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: getModelToken(AuditLog.name),
          useValue: mockAuditLogModel,
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
        userId: '65f1a2b3c4d5e6f7a8b9c0d1',
        action: 'item_created',
        entityType: 'Item',
        entityId: '65f1a2b3c4d5e6f7a8b9c0d2',
        summary: 'Created new wood item',
      };

      const expectedSavedDoc = { ...dto, _id: '65f1a2b3c4d5e6f7a8b9c0d3' };
      mockSave.mockResolvedValue(expectedSavedDoc);

      const result = await service.log(dto);

      expect(mockAuditLogModel).toHaveBeenCalledWith(dto);
      expect(mockSave).toHaveBeenCalledWith({ session: undefined });
      expect(result).toEqual(expectedSavedDoc);
    });

    it('should pass session to save if session is provided', async () => {
      const dto: CreateAuditLogDto = {
        userId: '65f1a2b3c4d5e6f7a8b9c0d1',
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
});
