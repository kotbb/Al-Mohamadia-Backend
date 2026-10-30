import {
  cairoCustomRange,
  cairoMidnightUtc,
  parseIsoDateParts,
  type CairoPeriodBucket,
} from '../../../shared/utils/period/cairo-period.util';

export function dashboardCustomBuckets(fromDate: string, toDate: string): CairoPeriodBucket[] {
  const range = cairoCustomRange(fromDate, toDate);
  const start = parseIsoDateParts(fromDate);
  const end = parseIsoDateParts(toDate);

  const dayCount =
    (Date.UTC(end.year, end.month - 1, end.day) - Date.UTC(start.year, start.month - 1, start.day)) / 86_400_000 + 1;
  if (dayCount > 3660) throw new Error('Custom dashboard ranges cannot exceed ten years');

  const buckets: CairoPeriodBucket[] = [];
  if (dayCount <= 62) {
    let cursor = new Date(Date.UTC(start.year, start.month - 1, start.day));
    while (true) {
      const year = cursor.getUTCFullYear();
      const month = cursor.getUTCMonth() + 1;
      const day = cursor.getUTCDate();
      const from = cairoMidnightUtc(year, month, day);
      if (from >= range.to) break;
      cursor = new Date(Date.UTC(year, month - 1, day + 1));
      const to = cairoMidnightUtc(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate());
      buckets.push({
        bucketStart: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        from,
        to,
      });
    }
  } else {
    let year = start.year;
    let month = start.month;
    while (true) {
      const nextYear = month === 12 ? year + 1 : year;
      const nextMonth = month === 12 ? 1 : month + 1;
      const monthEnd = cairoMidnightUtc(nextYear, nextMonth, 1);
      const from = buckets.length === 0 ? range.from : cairoMidnightUtc(year, month, 1);
      if (from >= range.to) break;
      buckets.push({
        bucketStart: `${year}-${String(month).padStart(2, '0')}`,
        from,
        to: monthEnd < range.to ? monthEnd : range.to,
      });
      year = nextYear;
      month = nextMonth;
    }
  }
  return buckets;
}
