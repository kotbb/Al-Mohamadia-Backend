import { metersToCubicMeters, lineTotalForPricing, stockDeltaForLine } from './cubic-meter.util';

describe('cubic-meter.util', () => {
  it('multiplies meter dimensions into cubic meters', () => {
    expect(metersToCubicMeters(0.02, 0.5, 1)).toBe(0.01);
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
        thicknessM: 0.02,
        widthM: 0.5,
        lengthM: 1,
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
        thicknessM: 0.02,
        widthM: 0.5,
        lengthM: 1,
      }),
    ).toBe(17);
  });
});
