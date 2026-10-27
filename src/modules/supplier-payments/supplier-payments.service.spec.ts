import { Types, Model, Connection } from 'mongoose';
import { SupplierPaymentsService } from './supplier-payments.service';
import { SupplierPaymentDocument } from './schemas/supplier-payment.schema';
import { SupplierDocument } from '../suppliers/schemas/supplier.schema';
import { AuditService } from '../audit/audit.service';

describe('SupplierPaymentsService list names', () => {
  const supplierId = new Types.ObjectId();
  const query = <T>(value: T) => ({
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  });
  const row = {
    _id: new Types.ObjectId(),
    supplierId,
    purchaseInvoiceId: null,
    amount: 10,
    recordedBy: new Types.ObjectId(),
    reversedAt: null,
    get: jest.fn(),
  };
  const paymentModel = { find: jest.fn(), countDocuments: jest.fn(), aggregate: jest.fn() };
  const supplierModel = { find: jest.fn() };
  const service = new SupplierPaymentsService(
    paymentModel as unknown as Model<SupplierPaymentDocument>,
    supplierModel as unknown as Model<SupplierDocument>,
    {} as Connection,
    {} as AuditService,
  );
  beforeEach(() => {
    jest.clearAllMocks();
    paymentModel.find.mockReturnValue(query([row, row]));
    paymentModel.countDocuments.mockReturnValue(query(2));
    paymentModel.aggregate.mockResolvedValue([]);
    supplierModel.find.mockReturnValue(query([{ _id: supplierId, name: 'Inactive supplier' }]));
  });
  it('batches unique page account names including inactive accounts', async () => {
    const result = await service.findAll({});
    expect(result.items.map((item) => item.supplierName)).toEqual(['Inactive supplier', 'Inactive supplier']);
    expect(supplierModel.find).toHaveBeenCalledTimes(1);
    expect(supplierModel.find).toHaveBeenCalledWith({ _id: { $in: [supplierId] }, isDeleted: false });
  });
  it('returns null for missing or deleted accounts and skips empty pages', async () => {
    supplierModel.find.mockReturnValue(query([]));
    expect((await service.findAll({})).items[0].supplierName).toBeNull();
    supplierModel.find.mockClear();
    paymentModel.find.mockReturnValue(query([]));
    expect((await service.findAll({})).items).toEqual([]);
    expect(supplierModel.find).not.toHaveBeenCalled();
  });
});
