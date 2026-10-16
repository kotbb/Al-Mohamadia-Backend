/**
 * Normalizes a phone string for storage and uniqueness checks:
 * trim + strip spaces and dashes. Returns empty string if nothing remains.
 */
import { BadRequestException } from '@nestjs/common';

export function normalizePhone(value: string): string {
  const digits = value
    .replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) - (digit <= '٩' ? 0x660 : 0x6f0)))
    .trim()
    .replace(/[\s-]+/g, '');
  return digits.startsWith('+20') ? `0${digits.slice(3)}` : digits;
}

/** Validate only new/changed phones; unchanged legacy values remain readable. */
export function assertEgyptianMobile(phone: string | null): void {
  if (phone !== null && !/^01[0125][0-9]{8}$/.test(phone)) {
    throw new BadRequestException('Phone must be a valid Egyptian mobile number (01 or +20 format)');
  }
}

/** Match valid legacy international storage without rewriting existing parties. */
export function equivalentMobilePhones(phone: string): string[] {
  if (!/^01[0125][0-9]{8}$/.test(phone)) return [phone];
  const international = `20${phone.slice(1)}`;
  return [phone, `+${international}`, `00${international}`];
}

export function normalizeOptionalPhone(value?: string | null): string | null {
  return value == null ? null : normalizePhone(value) || null;
}
