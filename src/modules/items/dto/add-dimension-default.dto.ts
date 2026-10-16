import { IsIn, IsNumber, IsPositive } from 'class-validator';
import type { DimensionDefaults } from '../types/dimension-defaults.types';

export class AddDimensionDefaultDto {
  @IsIn(['thickness', 'width', 'length'])
  dimension: keyof DimensionDefaults;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsPositive()
  value: number;
}
