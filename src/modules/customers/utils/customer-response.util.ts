import { CustomerDocument } from '../schemas/customer.schema';
import { CustomerResponseDto } from '../dto/response/customer-response.dto';

export function toCustomerResponseDto(customer: CustomerDocument): CustomerResponseDto {
  return {
    id: customer._id.toString(),
    name: customer.name,
    phone: customer.phone ?? null,
    address: customer.address ?? null,
    balance: customer.balance,
    isActive: customer.isActive,
    isDeleted: customer.isDeleted,
    createdAt: customer.get('createdAt') as Date | undefined,
    updatedAt: customer.get('updatedAt') as Date | undefined,
  };
}
