import { PATH_METADATA } from '@nestjs/common/constants';
import { OperatingExpensesController } from './operating-expenses.controller';

describe('OperatingExpensesController routes', () => {
  it('keeps expense and category operations in one route group', () => {
    expect(Reflect.getMetadata(PATH_METADATA, OperatingExpensesController)).toBe('operating-expenses');
    expect(Reflect.getMetadata(PATH_METADATA, OperatingExpensesController.prototype.listCategories)).toBe('categories');
    expect(Reflect.getMetadata(PATH_METADATA, OperatingExpensesController.prototype.createCategory)).toBe('categories');
    expect(Reflect.getMetadata(PATH_METADATA, OperatingExpensesController.prototype.updateCategory)).toBe(
      'categories/:id',
    );
    expect(Reflect.getMetadata(PATH_METADATA, OperatingExpensesController.prototype.list)).toBe('/');
  });
});
