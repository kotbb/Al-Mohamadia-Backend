import { IsArray, IsNumber, IsPositive } from 'class-validator';

export class DimensionDefaultsDto {
  @IsArray()
  @IsNumber({ allowNaN: false, allowInfinity: false }, { each: true })
  @IsPositive({ each: true })
  thickness: number[] = [];

  @IsArray()
  @IsNumber({ allowNaN: false, allowInfinity: false }, { each: true })
  @IsPositive({ each: true })
  width: number[] = [];

  @IsArray()
  @IsNumber({ allowNaN: false, allowInfinity: false }, { each: true })
  @IsPositive({ each: true })
  length: number[] = [];
}
