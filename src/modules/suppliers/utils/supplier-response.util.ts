import { SupplierDocument } from '../schemas/supplier.schema';
import { SupplierResponseDto } from '../dto/response/supplier-response.dto';

export function toSupplierResponseDto(supplier: SupplierDocument): SupplierResponseDto {
  return {
    id: supplier._id.toString(),
    name: supplier.name,
    phone: supplier.phone,
    address: supplier.address ?? null,
    amountOwed: supplier.amountOwed,
    isActive: supplier.isActive,
    isDeleted: supplier.isDeleted,
    createdAt: supplier.get('createdAt') as Date | undefined,
    updatedAt: supplier.get('updatedAt') as Date | undefined,
  };
}
