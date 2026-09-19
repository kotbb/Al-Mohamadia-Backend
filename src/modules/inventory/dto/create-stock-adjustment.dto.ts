import { IsMongoId, IsNotEmpty, IsNumber, IsString, MinLength } from 'class-validator';

export class CreateStockAdjustmentDto {
  @IsMongoId()
  itemId: string;

  @IsNumber()
  newQuantity: number;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  reason: string;
}
