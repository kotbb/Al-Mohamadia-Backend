import { BadRequestException } from '@nestjs/common';
import { formatCairoDate, parseIsoDateParts } from '../../../shared/utils/period/cairo-period.util';

export function validateLedgerDate(value: string): void {
  try {
    parseIsoDateParts(value);
  } catch {
    throw new BadRequestException('A valid calendar date is required');
  }
}

export function validateMovementDate(value: string, now = new Date()): void {
  validateLedgerDate(value);
  if (value > formatCairoDate(now)) throw new BadRequestException('Movement date cannot be in the future');
}

export function validateLedgerRange(from?: string, to?: string): void {
  if (from) validateLedgerDate(from);
  if (to) validateLedgerDate(to);
  if (from && to && from > to) throw new BadRequestException('from must not be after to');
}
