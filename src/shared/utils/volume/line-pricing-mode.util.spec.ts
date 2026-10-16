import { PricingMode } from '../../enums/pricing-mode.enum';
import { resolveLinePricingMode } from './line-pricing-mode.util';
import { stockDeltaForLine } from './cubic-meter.util';

describe('historical line pricing', () => {
  it('counts dimension-bearing piece lines as pieces, regardless of current item mode', () => {
    const pricingMode = resolveLinePricingMode({
      pricingModeSnapshot: PricingMode.PER_PIECE,
      thickness: 0.02,
      width: 0.5,
      length: 2,
    });
    expect(stockDeltaForLine({ pricingMode, quantity: 3, thicknessM: 0.02, widthM: 0.5, lengthM: 2 })).toBe(3);
  });

  it('keeps legacy cubic lines readable without modifying stored records', () => {
    expect(resolveLinePricingMode({ thickness: 0.02, width: 0.5, length: 2 })).toBe(PricingMode.PER_CUBIC_METER);
    expect(resolveLinePricingMode({ thickness: null, width: null, length: null })).toBe(PricingMode.PER_PIECE);
  });
});
