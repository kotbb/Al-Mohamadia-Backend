import { validateLedgerRange, validateMovementDate } from './personal-ledger-date.util';

describe('Personal ledger Cairo dates', () => {
  it('accepts Cairo today when UTC is still the preceding day', () => {
    expect(() => validateMovementDate('2026-10-25', new Date('2026-10-24T22:30:00Z'))).not.toThrow();
    expect(() => validateMovementDate('2026-10-26', new Date('2026-10-24T22:30:00Z'))).toThrow();
  });

  it('rejects non-existent calendar days and reversed ranges', () => {
    expect(() => validateMovementDate('2026-02-29', new Date('2026-10-25'))).toThrow();
    expect(() => validateLedgerRange('2020-02-31')).toThrow();
    expect(() => validateLedgerRange('2020-02-01', '2020-01-01')).toThrow();
    expect(() => validateLedgerRange('2020-01-01', '2020-01-01')).not.toThrow();
    expect(() => validateLedgerRange()).not.toThrow();
  });
});
