/**
 * Rounds a monetary value to 2 decimal places (EGP).
 */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
