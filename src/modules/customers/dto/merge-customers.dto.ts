import { ArrayMinSize, ArrayUnique, IsArray, IsMongoId, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class MergeCustomersDto {
  @IsMongoId()
  targetId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsMongoId({ each: true })
  sourceIds: string[];

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string | null;
}
