import { SalesInvoicePeriod } from '../../enums/sales-invoice-period.enum';
import { cairoPeriodRange, formatCairoDate, parseIsoDateParts } from './cairo-period.util';

describe('cairo-period.util', () => {
  it('parses ISO date parts', () => {
    expect(parseIsoDateParts('2026-03-15')).toEqual({
      year: 2026,
      month: 3,
      day: 15,
    });
  });

  it('day range is one Cairo calendar day', () => {
    const { from, to } = cairoPeriodRange(SalesInvoicePeriod.DAY, '2026-03-15');
    expect(to.getTime() - from.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(formatCairoDate(from)).toBe('2026-03-15');
  });

  it('week is Saturday–Friday containing the date', () => {
    // 2026-03-15 is a Sunday → week Sat 2026-03-14 to Fri 2026-03-20
    const { from, to } = cairoPeriodRange(SalesInvoicePeriod.WEEK, '2026-03-15');
    expect(formatCairoDate(from)).toBe('2026-03-14');
    expect(formatCairoDate(to)).toBe('2026-03-21');
  });

  it('month and year ranges use Cairo calendar boundaries', () => {
    const month = cairoPeriodRange(SalesInvoicePeriod.MONTH, '2026-03-15');
    expect(formatCairoDate(month.from)).toBe('2026-03-01');
    expect(formatCairoDate(month.to)).toBe('2026-04-01');

    const year = cairoPeriodRange(SalesInvoicePeriod.YEAR, '2026-03-15');
    expect(formatCairoDate(year.from)).toBe('2026-01-01');
    expect(formatCairoDate(year.to)).toBe('2027-01-01');
  });
});
