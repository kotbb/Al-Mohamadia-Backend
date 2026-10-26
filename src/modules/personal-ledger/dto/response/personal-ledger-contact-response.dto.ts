import { PersonalLedgerListMetaDto, PersonalLedgerSummaryResponseDto } from './personal-ledger-summary-response.dto';

export class PersonalLedgerContactResponseDto {
  id: string;
  name: string;
  customerId: string | null;
  isActive: boolean;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export class PersonalLedgerContactDetailDto extends PersonalLedgerContactResponseDto {
  summary: PersonalLedgerSummaryResponseDto;
}

export class PersonalLedgerContactListResponseDto {
  items: PersonalLedgerContactResponseDto[];
  meta: PersonalLedgerListMetaDto;
}
