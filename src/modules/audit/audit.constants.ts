export const AuditEntityType = {
  User: 'User',
} as const;

export const UserAuditAction = {
  Created: 'admin_created',
  Updated: 'admin_updated',
  Deleted: 'admin_deleted',
} as const;

export const USER_AUDIT_ACTIONS: readonly string[] = Object.values(UserAuditAction);

export function isUserAuditAction(action: string): boolean {
  return USER_AUDIT_ACTIONS.includes(action);
}
