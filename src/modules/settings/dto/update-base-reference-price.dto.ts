import { IsNumber, Min } from 'class-validator';

export class UpdateBaseReferencePriceDto {
  @IsNumber()
  @Min(0)
  value: number;
}
