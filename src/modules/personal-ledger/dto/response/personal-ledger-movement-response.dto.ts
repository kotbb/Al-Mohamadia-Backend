import { PaymentMethod } from '../../../../shared/enums/payment-method.enum';
import { PersonalLedgerMovementType } from '../../enums/personal-ledger-movement-type.enum';
import { PersonalLedgerListMetaDto, PersonalLedgerSummaryResponseDto } from './personal-ledger-summary-response.dto';

export class PersonalLedgerMovementResponseDto {
  id: string;
  contactId: string;
  contactName: string;
  type: PersonalLedgerMovementType;
  amount: number;
  movementDate: string;
  method: PaymentMethod | null;
  notes: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export class PersonalLedgerMovementListResponseDto {
  items: PersonalLedgerMovementResponseDto[];
  meta: PersonalLedgerListMetaDto;
  summary: PersonalLedgerSummaryResponseDto;
}

export class PersonalLedgerDeletedResponseDto {
  id: string;
}
