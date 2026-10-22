import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateSalesInvoiceDto } from './dto/request/create-sales-invoice.dto';
import { UpdateSalesInvoiceDto } from './dto/request/update-sales-invoice.dto';
import { ListSalesInvoicesQueryDto } from './dto/request/list-sales-invoices-query.dto';
import { CreatePurchaseInvoiceDto } from '../purchases/dto/request/create-purchase-invoice.dto';
import { UpdatePurchaseInvoiceDto } from '../purchases/dto/request/update-purchase-invoice.dto';

const commands = [CreateSalesInvoiceDto, UpdateSalesInvoiceDto, CreatePurchaseInvoiceDto, UpdatePurchaseInvoiceDto];

describe('Invoice account payment validation', () => {
  for (const Command of commands) {
    describe(Command.name, () => {
      it.each([-1, 0.001, NaN, Infinity, null, '10'])('rejects invalid account payment %s', (accountPaymentAmount) => {
        const errors = validateSync(plainToInstance(Command, { accountPaymentAmount }));
        expect(errors.some((error) => error.property === 'accountPaymentAmount')).toBe(true);
      });
      it.each([undefined, 0, 10.25])('accepts optional nonnegative money %s', (accountPaymentAmount) => {
        const errors = validateSync(plainToInstance(Command, { accountPaymentAmount }));
        expect(errors.some((error) => error.property === 'accountPaymentAmount')).toBe(false);
      });
    });
  }
  it('validates the customer filter', () => {
    expect(validateSync(plainToInstance(ListSalesInvoicesQueryDto, { customerId: 'bad' }))).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'customerId' })]),
    );
    expect(
      validateSync(plainToInstance(ListSalesInvoicesQueryDto, { customerId: '507f1f77bcf86cd799439003' })),
    ).toHaveLength(0);
  });
});
