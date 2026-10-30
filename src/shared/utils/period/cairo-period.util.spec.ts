import { SalesInvoicePeriod } from '../../enums/sales-invoice-period.enum';
import {
  cairoInclusiveDateBounds,
  cairoCustomRange,
  cairoPeriodBuckets,
  cairoPeriodRange,
  formatCairoDate,
  parseIsoDateParts,
} from './cairo-period.util';

describe('cairo-period.util', () => {
  it.each([
    ['2026-10-29', '2026-10-28T21:00:00.000Z', '2026-10-29T22:00:00.000Z', 25],
    ['2026-10-30', '2026-10-29T22:00:00.000Z', '2026-10-30T22:00:00.000Z', 24],
    ['2026-04-24', '2026-04-23T22:00:00.000Z', '2026-04-24T21:00:00.000Z', 23],
  ])('uses exact Cairo calendar boundaries for %s', (date, from, to, hours) => {
    const range = cairoPeriodRange(SalesInvoicePeriod.DAY, date);
    expect(range.from.toISOString()).toBe(from);
    expect(range.to.toISOString()).toBe(to);
    expect(range.to.getTime() - range.from.getTime()).toBe(Number(hours) * 3_600_000);
  });

  it('includes both occurrences of 23:30 in the winter transition day', () => {
    const range = cairoPeriodRange(SalesInvoicePeriod.DAY, '2026-10-29');
    for (const instant of ['2026-10-29T20:30:00Z', '2026-10-29T21:30:00Z']) {
      const date = new Date(instant);
      expect(formatCairoDate(date)).toBe('2026-10-29');
      expect(date.getTime()).toBeGreaterThanOrEqual(range.from.getTime());
      expect(date.getTime()).toBeLessThan(range.to.getTime());
    }
  });

  it('uses inclusive Cairo custom dates and rejects incomplete or reversed ranges', () => {
    const range = cairoCustomRange('2026-10-01', '2026-10-31');
    expect(formatCairoDate(range.from)).toBe('2026-10-01');
    expect(formatCairoDate(range.to)).toBe('2026-11-01');
    expect(() => cairoCustomRange('2026-10-31', '2026-10-01')).toThrow();
    expect(() => cairoCustomRange('2026-10-01')).toThrow();
    expect(() => cairoCustomRange('2026-02-31', '2026-03-01')).toThrow();
  });
  it('parses ISO date parts', () => {
    expect(parseIsoDateParts('2026-03-15')).toEqual({
      year: 2026,
      month: 3,
      day: 15,
    });
  });

  it('rejects non-existent calendar days', () => {
    expect(() => parseIsoDateParts('2026-02-31')).toThrow(/Invalid ISO date/);
    expect(() => parseIsoDateParts('2026-13-01')).toThrow(/Invalid ISO date/);
    expect(() => parseIsoDateParts('2026-04-31')).toThrow(/Invalid ISO date/);
  });

  it('accepts valid leap day', () => {
    expect(parseIsoDateParts('2024-02-29')).toEqual({
      year: 2024,
      month: 2,
      day: 29,
    });
  });

  it('inclusive date bounds cover each Cairo calendar day', () => {
    const sameDay = cairoInclusiveDateBounds('2026-03-15', '2026-03-15');
    expect(sameDay.lt!.getTime() - sameDay.gte!.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(formatCairoDate(sameDay.gte!)).toBe('2026-03-15');
    expect(formatCairoDate(sameDay.lt!)).toBe('2026-03-16');

    const fromOnly = cairoInclusiveDateBounds('2026-03-15');
    expect(fromOnly.gte).toEqual(sameDay.gte);
    expect(fromOnly.lt).toBeUndefined();

    expect(() => cairoInclusiveDateBounds('2026-02-31')).toThrow(/Invalid ISO date/);
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

  describe('cairoPeriodBuckets', () => {
    it('day yields one bucket', () => {
      const buckets = cairoPeriodBuckets(SalesInvoicePeriod.DAY, '2026-03-15');
      expect(buckets).toHaveLength(1);
      expect(buckets[0].bucketStart).toBe('2026-03-15');
      expect(formatCairoDate(buckets[0].from)).toBe('2026-03-15');
      expect(formatCairoDate(buckets[0].to)).toBe('2026-03-16');
    });

    it('week yields 7 daily buckets Sat–Fri', () => {
      const buckets = cairoPeriodBuckets(SalesInvoicePeriod.WEEK, '2026-03-15');
      expect(buckets).toHaveLength(7);
      expect(buckets[0].bucketStart).toBe('2026-03-14');
      expect(buckets[6].bucketStart).toBe('2026-03-20');
      expect(formatCairoDate(buckets[6].to)).toBe('2026-03-21');
    });

    it('month yields one bucket per calendar day', () => {
      const buckets = cairoPeriodBuckets(SalesInvoicePeriod.MONTH, '2026-03-15');
      expect(buckets).toHaveLength(31);
      expect(buckets[0].bucketStart).toBe('2026-03-01');
      expect(buckets[30].bucketStart).toBe('2026-03-31');
      expect(formatCairoDate(buckets[30].to)).toBe('2026-04-01');
    });

    it('year yields 12 monthly buckets', () => {
      const buckets = cairoPeriodBuckets(SalesInvoicePeriod.YEAR, '2026-03-15');
      expect(buckets).toHaveLength(12);
      expect(buckets[0].bucketStart).toBe('2026-01');
      expect(buckets[11].bucketStart).toBe('2026-12');
      expect(formatCairoDate(buckets[0].from)).toBe('2026-01-01');
      expect(formatCairoDate(buckets[11].to)).toBe('2027-01-01');
    });
  });
});
