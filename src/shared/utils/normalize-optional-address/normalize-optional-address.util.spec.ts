import { normalizeOptionalAddress } from './normalize-optional-address.util';

describe('normalizeOptionalAddress', () => {
  it('trims non-empty addresses', () => {
    expect(normalizeOptionalAddress('  Cairo  ')).toBe('Cairo');
    expect(normalizeOptionalAddress('Alexandria')).toBe('Alexandria');
  });

  it('returns null for missing or blank values', () => {
    expect(normalizeOptionalAddress(undefined)).toBeNull();
    expect(normalizeOptionalAddress(null)).toBeNull();
    expect(normalizeOptionalAddress('')).toBeNull();
    expect(normalizeOptionalAddress('   ')).toBeNull();
  });
});
