export class PersonalLedgerSummaryResponseDto {
  deposits: number;
  withdrawals: number;
  net: number;
  count: number;
}

export class PersonalLedgerListMetaDto {
  page: number;
  limit: number;
  total: number;
}
