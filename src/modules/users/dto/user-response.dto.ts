import { UserRole } from '../../../shared/auth/enums/user-role.enum';

export class UserResponseDto {
  id: string;
  username: string;
  role: UserRole;
  isActive: boolean;
  isDeleted: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
