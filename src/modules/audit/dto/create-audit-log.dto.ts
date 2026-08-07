import { IsMongoId, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateAuditLogDto {
  @IsMongoId()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  action: string;

  @IsString()
  @IsNotEmpty()
  entityType: string;

  @IsMongoId()
  @IsNotEmpty()
  entityId: string;

  @IsOptional()
  changes?: Record<string, { old: unknown; new: unknown }> | null;

  @IsOptional()
  @IsString()
  refCollection?: string | null;

  @IsOptional()
  @IsMongoId()
  refId?: string | null;

  @IsOptional()
  @IsString()
  summary?: string | null;
}
