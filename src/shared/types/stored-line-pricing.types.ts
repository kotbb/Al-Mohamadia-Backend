import { PricingMode } from '../enums/pricing-mode.enum';
export interface StoredLinePricing {
  pricingModeSnapshot?: PricingMode | null;
  thickness?: number | null;
  width?: number | null;
  length?: number | null;
}
