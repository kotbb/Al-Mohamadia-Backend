/**
 * Multiplies thickness × width × length in meters to cubic meters.
 * Rounded to 6 decimal places for stock quantities.
 */
export function metersToCubicMeters(thicknessM: number, widthM: number, lengthM: number): number {
  const volume = thicknessM * widthM * lengthM;
  return Math.round(volume * 1_000_000) / 1_000_000;
}

/**
 * Stock quantity to deduct for a sales line.
 * per_cubic_meter: quantity × volume (m³); per_piece: quantity (pieces).
 */
export function stockDeltaForLine(params: {
  pricingMode: 'per_piece' | 'per_cubic_meter' | 'free_amount';
  quantity: number;
  thicknessM?: number | null;
  widthM?: number | null;
  lengthM?: number | null;
}): number {
  if (params.pricingMode === 'free_amount') return 0;
  if (params.pricingMode === 'per_piece') {
    return params.quantity;
  }

  const thickness = params.thicknessM ?? 0;
  const width = params.widthM ?? 0;
  const length = params.lengthM ?? 0;
  const volume = metersToCubicMeters(thickness, width, length);
  return Math.round(params.quantity * volume * 1_000_000) / 1_000_000;
}

/**
 * Line total for a sales line (EGP, caller should roundMoney).
 * per_cubic_meter: quantity × volume × piecePrice; per_piece: quantity × piecePrice.
 */
export function lineTotalForPricing(params: {
  pricingMode: 'per_piece' | 'per_cubic_meter' | 'free_amount';
  quantity: number;
  piecePrice: number;
  thicknessM?: number | null;
  widthM?: number | null;
  lengthM?: number | null;
}): number {
  if (params.pricingMode === 'free_amount') return params.piecePrice;
  if (params.pricingMode === 'per_piece') {
    return params.quantity * params.piecePrice;
  }

  const thickness = params.thicknessM ?? 0;
  const width = params.widthM ?? 0;
  const length = params.lengthM ?? 0;
  const volume = metersToCubicMeters(thickness, width, length);
  return params.quantity * volume * params.piecePrice;
}
