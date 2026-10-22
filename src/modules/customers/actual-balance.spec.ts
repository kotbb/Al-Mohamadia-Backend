import 'reflect-metadata';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCustomerDto } from './dto/request/create-customer.dto';
import { UpdateCustomerDto } from './dto/request/update-customer.dto';
import { CreateSupplierDto } from '../suppliers/dto/request/create-supplier.dto';
import { UpdateSupplierDto } from '../suppliers/dto/request/update-supplier.dto';

describe('Actual balance validation', () => {
  const commands: Array<{ dto: ClassConstructor<object>; field: string }> = [
    { dto: CreateCustomerDto, field: 'balance' },
    { dto: UpdateCustomerDto, field: 'balance' },
    { dto: CreateSupplierDto, field: 'amountOwed' },
    { dto: UpdateSupplierDto, field: 'amountOwed' },
  ];
  for (const { dto, field } of commands) {
    it(`${dto.name} rejects invalid amounts`, async () => {
      for (const value of [1.001, null, Infinity, NaN, '10']) {
        const errors = await validate(plainToInstance(dto, { name: 'Party', [field]: value }));
        expect(errors.some((error) => error.property === field)).toBe(true);
      }
    });
    it(`${dto.name} accepts signed money, zero and omitted balances`, async () => {
      for (const value of [-12.25, 0, 12.25, undefined]) {
        expect(await validate(plainToInstance(dto, { name: 'Party', [field]: value }))).toHaveLength(0);
      }
    });
  }
});
