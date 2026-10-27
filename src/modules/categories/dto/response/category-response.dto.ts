export class CategoryResponseDto {
  id: string;
  name: string;
  itemCount?: number;
  isActive: boolean;
  isDeleted: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
