import { parseDurationMs } from './parse-duration.util';

describe('parseDurationMs', () => {
  it('parses seconds, minutes, hours, and days', () => {
    expect(parseDurationMs('10s')).toBe(10_000);
    expect(parseDurationMs('10m')).toBe(600_000);
    expect(parseDurationMs('2h')).toBe(7_200_000);
    expect(parseDurationMs('21d')).toBe(21 * 86_400_000);
  });

  it('trims whitespace', () => {
    expect(parseDurationMs(' 5m ')).toBe(300_000);
  });

  it('throws on invalid format', () => {
    expect(() => parseDurationMs('10')).toThrow('Invalid duration format');
    expect(() => parseDurationMs('abc')).toThrow('Invalid duration format');
  });
});
