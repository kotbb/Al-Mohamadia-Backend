import { roundMoney } from './round-money.util';

describe('roundMoney', () => {
  it('rounds to 2 decimal places', () => {
    expect(roundMoney(10.556)).toBe(10.56);
    expect(roundMoney(10.554)).toBe(10.55);
    expect(roundMoney(100)).toBe(100);
    expect(roundMoney(0)).toBe(0);
  });
});
