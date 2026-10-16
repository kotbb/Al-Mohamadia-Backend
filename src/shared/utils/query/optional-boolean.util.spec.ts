import { optionalBoolean } from './optional-boolean.util';

describe('optionalBoolean', () => {
  it.each([undefined, null, ''])('leaves missing query values optional', (value) => {
    expect(optionalBoolean({ value })).toBeUndefined();
  });
  it.each([
    [true, true],
    ['true', true],
    [false, false],
    ['false', false],
  ])('normalizes %s', (value, expected) => {
    expect(optionalBoolean({ value })).toBe(expected);
  });
  it('preserves invalid values for the DTO validator to reject', () => {
    expect(optionalBoolean({ value: 'invalid' })).toBe('invalid');
  });
});
