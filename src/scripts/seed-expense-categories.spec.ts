import { NestFactory } from '@nestjs/core';
import { seedExpenseCategories } from './seed-expense-categories';

describe('seedExpenseCategories', () => {
  it('repairs the malformed utilities code and seeds the six categories without overwriting edits', async () => {
    const exists = jest.fn().mockResolvedValue(null);
    const updateOne = jest.fn().mockResolvedValue({});
    const close = jest.fn().mockResolvedValue(undefined);
    const createContext = jest.spyOn(NestFactory, 'createApplicationContext').mockResolvedValue({
      get: () => ({ exists, updateOne }),
      close,
    } as never);

    try {
      await seedExpenseCategories();
      expect(updateOne).toHaveBeenNthCalledWith(1, { code: '"المرافق' }, { $set: { code: 'المرافق' } });
      expect(updateOne).toHaveBeenCalledTimes(7);
      expect(updateOne.mock.calls.slice(1).map(([filter]) => filter)).toEqual([
        { code: 'الإيجار' },
        { code: 'الأجور' },
        { code: 'المرافق' },
        { code: 'النقل' },
        { code: 'الصيانة' },
        { code: 'أخرى' },
      ]);
      for (const [, update, options] of updateOne.mock.calls.slice(1)) {
        expect(update).toEqual({ $setOnInsert: expect.objectContaining({ name: null, isActive: true }) });
        expect(options).toEqual({ upsert: true });
      }
      expect(close).toHaveBeenCalledTimes(1);
    } finally {
      createContext.mockRestore();
    }
  });
});
