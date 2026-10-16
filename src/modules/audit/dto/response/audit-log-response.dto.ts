export class AuditActorDto {
  id: string;
  username: string | null;
}

export class AuditLogResponseDto {
  id: string;
  createdAt: Date;
  user: AuditActorDto;
  action: string;
  entityType: string;
  entityId: string;
  summary: string | null;
  changes: Record<string, { old: unknown; new: unknown }> | null;
  refCollection: string | null;
  refId: string | null;
}

export class AuditLogListMetaDto {
  page: number;
  limit: number;
  total: number;
}

export class AuditLogListResponseDto {
  items: AuditLogResponseDto[];
  meta: AuditLogListMetaDto;
}
