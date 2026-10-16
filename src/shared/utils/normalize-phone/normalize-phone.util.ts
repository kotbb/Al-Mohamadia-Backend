/**
 * Normalizes a phone string for storage and uniqueness checks:
 * trim + strip spaces and dashes. Returns empty string if nothing remains.
 */
export function normalizePhone(value: string): string {
  return value.trim().replace(/[\s-]+/g, '');
}

export function normalizeOptionalPhone(value?: string | null): string | null {
  return value == null ? null : normalizePhone(value) || null;
}
