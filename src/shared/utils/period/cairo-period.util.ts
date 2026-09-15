import { SalesInvoicePeriod } from '../../enums/sales-invoice-period.enum';

const CAIRO_TZ = 'Africa/Cairo';

export type CairoPeriodRange = {
  from: Date;
  to: Date;
};

/**
 * Formats a Date as YYYY-MM-DD in Africa/Cairo.
 */
export function formatCairoDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CAIRO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Parses YYYY-MM-DD into year/month/day parts.
 */
export function parseIsoDateParts(isoDate: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }
  return { year, month, day };
}

/**
 * Instant at local Cairo midnight for the given calendar date.
 * Uses the offset that applies at noon UTC that day to handle DST safely enough for Egypt.
 */
export function cairoMidnightUtc(year: number, month: number, day: number): Date {
  const noonUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CAIRO_TZ,
    timeZoneName: 'longOffset',
  }).formatToParts(noonUtc);

  const tzName = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+2';
  const offsetMatch = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(tzName);
  let offsetMinutes = 120; // Africa/Cairo standard
  if (offsetMatch) {
    const sign = offsetMatch[1] === '-' ? -1 : 1;
    const hours = Number(offsetMatch[2]);
    const mins = Number(offsetMatch[3] ?? 0);
    offsetMinutes = sign * (hours * 60 + mins);
  }

  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMinutes * 60_000);
}

function addCalendarDays(year: number, month: number, day: number, delta: number): {
  year: number;
  month: number;
  day: number;
} {
  const utc = new Date(Date.UTC(year, month - 1, day + delta));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

/** JS getUTCDay: 0=Sun … 6=Sat. Week is Sat–Fri. */
function daysSinceSaturday(utcDay: number): number {
  return (utcDay + 1) % 7;
}

/**
 * Returns [from, to) UTC range for a Cairo calendar period containing `isoDate`.
 * Week starts Saturday and ends Friday.
 */
export function cairoPeriodRange(period: SalesInvoicePeriod, isoDate: string): CairoPeriodRange {
  const { year, month, day } = parseIsoDateParts(isoDate);

  if (period === SalesInvoicePeriod.DAY) {
    const from = cairoMidnightUtc(year, month, day);
    const next = addCalendarDays(year, month, day, 1);
    const to = cairoMidnightUtc(next.year, next.month, next.day);
    return { from, to };
  }

  if (period === SalesInvoicePeriod.MONTH) {
    const from = cairoMidnightUtc(year, month, 1);
    const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
    const to = cairoMidnightUtc(nextMonth.year, nextMonth.month, 1);
    return { from, to };
  }

  if (period === SalesInvoicePeriod.YEAR) {
    const from = cairoMidnightUtc(year, 1, 1);
    const to = cairoMidnightUtc(year + 1, 1, 1);
    return { from, to };
  }

  // WEEK: Saturday-Friday containing the date
  const probe = cairoMidnightUtc(year, month, day);
  // Determine weekday in Cairo by formatting
  const weekdayName = new Intl.DateTimeFormat('en-US', {
    timeZone: CAIRO_TZ,
    weekday: 'short',
  }).format(probe);
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekday = weekdayMap[weekdayName] ?? 6;
  const sinceSat = daysSinceSaturday(weekday);
  const weekStart = addCalendarDays(year, month, day, -sinceSat);
  const weekEndExclusive = addCalendarDays(weekStart.year, weekStart.month, weekStart.day, 7);

  return {
    from: cairoMidnightUtc(weekStart.year, weekStart.month, weekStart.day),
    to: cairoMidnightUtc(weekEndExclusive.year, weekEndExclusive.month, weekEndExclusive.day),
  };
}

/**
 * Cairo calendar year for "now" (for invoice number prefix).
 */
export function cairoYearNow(now: Date = new Date()): number {
  const y = new Intl.DateTimeFormat('en-US', {
    timeZone: CAIRO_TZ,
    year: 'numeric',
  }).format(now);
  return Number(y);
}
