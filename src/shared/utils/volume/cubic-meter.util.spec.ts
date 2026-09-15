import { cmToCubicMeters, lineTotalForPricing, stockDeltaForLine } from './cubic-meter.util';

describe('cubic-meter.util', () => {
  it('converts cm dimensions to m³', () => {
    // 100 × 50 × 2 cm = 0.01 m³
    expect(cmToCubicMeters(2, 50, 100)).toBe(0.01);
  });

  it('computes piece stock delta as quantity', () => {
    expect(
      stockDeltaForLine({
        pricingMode: 'per_piece',
        quantity: 3,
      }),
    ).toBe(3);
  });

  it('computes cubic stock delta as quantity × volume', () => {
    expect(
      stockDeltaForLine({
        pricingMode: 'per_cubic_meter',
        quantity: 2,
        thicknessCm: 2,
        widthCm: 50,
        lengthCm: 100,
      }),
    ).toBe(0.02);
  });

  it('computes piece and cubic line totals', () => {
    expect(
      lineTotalForPricing({
        pricingMode: 'per_piece',
        quantity: 2,
        piecePrice: 450,
      }),
    ).toBe(900);

    expect(
      lineTotalForPricing({
        pricingMode: 'per_cubic_meter',
        quantity: 2,
        piecePrice: 850,
        thicknessCm: 2,
        widthCm: 50,
        lengthCm: 100,
      }),
    ).toBe(17);
  });
});
