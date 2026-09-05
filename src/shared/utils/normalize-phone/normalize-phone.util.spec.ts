import { normalizePhone } from './normalize-phone.util';

describe('normalizePhone', () => {
  it('trims and strips spaces and dashes', () => {
    expect(normalizePhone(' 010 1234-5678 ')).toBe('01012345678');
    expect(normalizePhone('010-123-4567')).toBe('0101234567');
    expect(normalizePhone('01234567890')).toBe('01234567890');
  });

  it('returns empty string when only separators remain', () => {
    expect(normalizePhone('   ')).toBe('');
    expect(normalizePhone(' - - ')).toBe('');
  });
});
