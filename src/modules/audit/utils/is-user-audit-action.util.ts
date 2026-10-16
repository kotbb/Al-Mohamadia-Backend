import { USER_AUDIT_ACTIONS } from '../audit.constants';
export function isUserAuditAction(action: string): boolean {
  return USER_AUDIT_ACTIONS.includes(action);
}
