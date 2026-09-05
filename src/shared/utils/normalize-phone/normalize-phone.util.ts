/**
 * Normalizes a phone string for storage and uniqueness checks:
 * trim + strip spaces and dashes. Returns empty string if nothing remains.
 */
export function normalizePhone(value: string): string {
  return value.trim().replace(/[\s-]+/g, '');
}
