import { dashboardCustomBuckets } from './dashboard-custom-buckets.util';

describe('dashboardCustomBuckets', () => {
  it.each([
    ['2026-08-29', '2026-10-29'],
    ['2026-03-01', '2026-05-01'],
  ])('keeps 62 calendar days daily across clock changes (%s to %s)', (from, to) => {
    const buckets = dashboardCustomBuckets(from, to);
    expect(buckets).toHaveLength(62);
    expect(buckets[0].bucketStart).toBe(from);
    expect(buckets[61].bucketStart).toBe(to);
    for (let i = 1; i < buckets.length; i++) {
      expect(buckets[i].from).toEqual(buckets[i - 1].to);
    }
  });

  it('groups 63 calendar days monthly with clipped endpoint buckets', () => {
    const buckets = dashboardCustomBuckets('2026-08-28', '2026-10-29');
    expect(buckets.map((bucket) => bucket.bucketStart)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(buckets[0].from.toISOString()).toBe('2026-08-27T21:00:00.000Z');
    expect(buckets[2].to.toISOString()).toBe('2026-10-29T22:00:00.000Z');
    for (let i = 1; i < buckets.length; i++) {
      expect(buckets[i].from).toEqual(buckets[i - 1].to);
    }
  });

  it('keeps a single 25-hour day in one daily bucket', () => {
    const buckets = dashboardCustomBuckets('2026-10-29', '2026-10-29');
    expect(buckets).toHaveLength(1);
    expect(buckets[0].bucketStart).toBe('2026-10-29');
    expect(buckets[0].from.toISOString()).toBe('2026-10-28T21:00:00.000Z');
    expect(buckets[0].to.toISOString()).toBe('2026-10-29T22:00:00.000Z');
  });

  it('accepts 3660 calendar days even when the final offset is an hour earlier', () => {
    // Starts in summer time and ends in winter time: 3660 days plus one hour.
    const buckets = dashboardCustomBuckets('2026-10-25', '2036-10-31');
    expect(buckets[0].bucketStart).toBe('2026-10');
    expect(buckets[buckets.length - 1].bucketStart).toBe('2036-10');
  });

  it('rejects 3661 calendar days', () => {
    expect(() => dashboardCustomBuckets('2026-10-25', '2036-11-01')).toThrow(
      'Custom dashboard ranges cannot exceed ten years',
    );
  });
});
