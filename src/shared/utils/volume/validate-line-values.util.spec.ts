import { validateLineValues } from './validate-line-values.util';

describe('write-time line validation', () => {
  const base = { isCubic: true, thickness: 0.1, width: 0.2, length: 0.3, stockDelta: 0.006, lineTotal: 120 };
  it('accepts valid cubic and descriptive piece dimensions', () => {
    expect(() => validateLineValues(base)).not.toThrow();
    expect(() => validateLineValues({ ...base, isCubic: false, stockDelta: 1, thickness: 0.000001 })).not.toThrow();
  });
  it('rejects zero rounded volumes and overflowing calculations', () => {
    expect(() => validateLineValues({ ...base, thickness: 0.000001, width: 0.000001, length: 0.000001 })).toThrow();
    expect(() => validateLineValues({ ...base, stockDelta: Infinity })).toThrow();
    expect(() => validateLineValues({ ...base, lineTotal: Infinity })).toThrow();
  });
});
