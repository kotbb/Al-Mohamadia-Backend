/**
 * Converts thickness × width × length in cm to cubic meters.
 * Rounded to 6 decimal places for stock quantities.
 */
export function cmToCubicMeters(thicknessCm: number, widthCm: number, lengthCm: number): number {
  const volume = (thicknessCm * widthCm * lengthCm) / 1_000_000;
  return Math.round(volume * 1_000_000) / 1_000_000;
}

/**
 * Stock quantity to deduct for a sales line.
 * per_cubic_meter: quantity × volume (m³); per_piece: quantity (pieces).
 */
export function stockDeltaForLine(params: {
  pricingMode: 'per_piece' | 'per_cubic_meter';
  quantity: number;
  thicknessCm?: number | null;
  widthCm?: number | null;
  lengthCm?: number | null;
}): number {
  if (params.pricingMode === 'per_piece') {
    return params.quantity;
  }

  const thickness = params.thicknessCm ?? 0;
  const width = params.widthCm ?? 0;
  const length = params.lengthCm ?? 0;
  const volume = cmToCubicMeters(thickness, width, length);
  return Math.round(params.quantity * volume * 1_000_000) / 1_000_000;
}

/**
 * Line total for a sales line (EGP, caller should roundMoney).
 * per_cubic_meter: quantity × volume × piecePrice; per_piece: quantity × piecePrice.
 */
export function lineTotalForPricing(params: {
  pricingMode: 'per_piece' | 'per_cubic_meter';
  quantity: number;
  piecePrice: number;
  thicknessCm?: number | null;
  widthCm?: number | null;
  lengthCm?: number | null;
}): number {
  if (params.pricingMode === 'per_piece') {
    return params.quantity * params.piecePrice;
  }

  const thickness = params.thicknessCm ?? 0;
  const width = params.widthCm ?? 0;
  const length = params.lengthCm ?? 0;
  const volume = cmToCubicMeters(thickness, width, length);
  return params.quantity * volume * params.piecePrice;
}
