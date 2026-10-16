import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateStockAdjustmentDto } from '../../../modules/inventory/dto/request/create-stock-adjustment.dto';
import { CreatePurchaseInvoiceDto } from '../../../modules/purchases/dto/request/create-purchase-invoice.dto';
import { RecordSupplierPaymentDto } from '../../../modules/supplier-payments/dto/request/record-supplier-payment.dto';
import { IsMoneyAmount } from './is-money-amount.decorator';

const ITEM_ID = '507f1f77bcf86cd799439011';
const SUPPLIER_ID = '507f1f77bcf86cd799439012';

class MoneySample {
  @IsMoneyAmount()
  amount: number;
}

describe('IsMoneyAmount', () => {
  async function errorsFor(amount: number) {
    const dto = new MoneySample();
    dto.amount = amount;
    return validate(dto);
  }

  it('accepts finite 2-decimal amounts', async () => {
    expect(await errorsFor(10)).toHaveLength(0);
    expect(await errorsFor(10.1)).toHaveLength(0);
    expect(await errorsFor(10.12)).toHaveLength(0);
  });

  it('rejects extra decimals and non-finite numbers', async () => {
    expect(await errorsFor(10.129)).not.toHaveLength(0);
    expect(await errorsFor(Number.POSITIVE_INFINITY)).not.toHaveLength(0);
    expect(await errorsFor(Number.NaN)).not.toHaveLength(0);
  });
});

describe('money write DTO edges', () => {
  it('rejects a purchase unitCost with extra decimals', async () => {
    const dto = plainToInstance(CreatePurchaseInvoiceDto, {
      supplierId: SUPPLIER_ID,
      lines: [{ itemId: ITEM_ID, quantity: 1, unitCost: 10.129 }],
      paid: 0,
    });
    const errors = await validate(dto);
    const lineErrors = errors.find((error) => error.property === 'lines');
    expect(lineErrors?.children?.length).toBeGreaterThan(0);
  });

  it('rejects a supplier payment amount with extra decimals', async () => {
    const dto = plainToInstance(RecordSupplierPaymentDto, {
      supplierId: SUPPLIER_ID,
      amount: 10.129,
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'amount')).toBe(true);
  });

  it('rejects a stock reason longer than 500 characters', async () => {
    const dto = plainToInstance(CreateStockAdjustmentDto, {
      itemId: ITEM_ID,
      newQuantity: 4,
      reason: 'a'.repeat(501),
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'reason')).toBe(true);
  });
});
