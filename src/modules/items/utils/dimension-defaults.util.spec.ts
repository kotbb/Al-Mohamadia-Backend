import { normalizeDimensionDefaults } from './dimension-defaults.util';

describe('dimension defaults', () => {
  it('deduplicates and sorts meter values without changing the supplied arrays', () => {
    const input = { thickness: [0.22, 0.16, 0.22], width: [0.5], length: [] };
    expect(normalizeDimensionDefaults(input)).toEqual({ thickness: [0.16, 0.22], width: [0.5], length: [] });
    expect(input.thickness).toEqual([0.22, 0.16, 0.22]);
  });

  it('gives existing items empty defaults and rejects invalid meter values', () => {
    expect(normalizeDimensionDefaults()).toEqual({ thickness: [], width: [], length: [] });
    for (const value of [0, -1, NaN, Infinity]) {
      expect(() => normalizeDimensionDefaults({ thickness: [value] })).toThrow();
    }
  });
});
