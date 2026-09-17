/**
 * Trims an optional address. Returns null when missing or blank after trim.
 */
export function normalizeOptionalAddress(value?: string | null): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
