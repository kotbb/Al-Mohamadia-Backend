import type { StoredLinePricing } from '../../types/stored-line-pricing.types';
import { PricingMode } from '../../enums/pricing-mode.enum';

export function resolveLinePricingMode(line: StoredLinePricing): PricingMode {
  return (
    line.pricingModeSnapshot ??
    (line.thickness != null && line.width != null && line.length != null
      ? PricingMode.PER_CUBIC_METER
      : PricingMode.PER_PIECE)
  );
}
