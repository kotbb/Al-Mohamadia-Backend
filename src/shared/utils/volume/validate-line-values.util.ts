import { BadRequestException } from '@nestjs/common';
import { metersToCubicMeters } from './cubic-meter.util';

/** Write-time checks only: legacy read/reversal calculations remain unchanged. */
export function validateLineValues(params: {
  isCubic: boolean;
  isFreeAmount?: boolean;
  thickness: number | null;
  width: number | null;
  length: number | null;
  stockDelta: number;
  lineTotal: number;
}): void {
  if (
    !Number.isFinite(params.lineTotal) ||
    (params.isFreeAmount && params.lineTotal <= 0) ||
    !Number.isFinite(params.stockDelta) ||
    (params.isFreeAmount ? params.stockDelta !== 0 : params.stockDelta <= 0)
  ) {
    throw new BadRequestException('Line total and stock quantity must be finite, with positive stock quantity');
  }
  if (params.isCubic) {
    const volume = metersToCubicMeters(params.thickness ?? 0, params.width ?? 0, params.length ?? 0);
    if (!Number.isFinite(volume) || volume <= 0) {
      throw new BadRequestException('Dimensions must produce a positive volume at 6 decimal places');
    }
  }
}
