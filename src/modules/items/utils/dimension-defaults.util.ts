import type { DimensionDefaults } from '../types/dimension-defaults.types';
import { BadRequestException } from '@nestjs/common';

export function normalizeDimensionDefaults(value?: Partial<DimensionDefaults> | null): DimensionDefaults {
  const normalize = (values: number[] = []): number[] => {
    if (values.some((entry) => !Number.isFinite(entry) || entry <= 0)) {
      throw new BadRequestException('Dimension defaults must be positive finite meter values');
    }
    return [...new Set(values)].sort((a, b) => a - b);
  };
  return {
    thickness: normalize(value?.thickness),
    width: normalize(value?.width),
    length: normalize(value?.length),
  };
}
