import { IsMongoId, IsNotEmpty, IsNumber, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateStockAdjustmentDto {
  @IsMongoId()
  itemId: string;

  @IsNumber()
  newQuantity: number;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
