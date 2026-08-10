import { UserRole } from '../enums/user-role.enum';

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
}
