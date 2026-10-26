import { roundMoney } from '../../../shared/utils/round-money/round-money.util';
import { PersonalLedgerContactResponseDto } from '../dto/response/personal-ledger-contact-response.dto';
import { PersonalLedgerMovementResponseDto } from '../dto/response/personal-ledger-movement-response.dto';
import { PersonalLedgerSummaryResponseDto } from '../dto/response/personal-ledger-summary-response.dto';
import type { LedgerContactRow, LedgerMovementRow, LedgerSummaryRow } from '../types/personal-ledger.types';

export function ledgerContactResponse(row: LedgerContactRow): PersonalLedgerContactResponseDto {
  return {
    id: row._id.toString(),
    name: row.name,
    customerId: row.customerId?.toString() ?? null,
    isActive: row.isActive,
    createdBy: row.createdBy.toString(),
    updatedBy: row.updatedBy.toString(),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function ledgerMovementResponse(
  row: LedgerMovementRow,
  contactName = row.contactName ?? '',
): PersonalLedgerMovementResponseDto {
  return {
    id: row._id.toString(),
    contactId: row.contactId.toString(),
    contactName,
    type: row.type,
    amount: row.amount,
    movementDate: row.movementDate,
    method: row.method,
    notes: row.notes,
    createdBy: row.createdBy.toString(),
    updatedBy: row.updatedBy.toString(),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function ledgerSummaryResponse(row?: LedgerSummaryRow): PersonalLedgerSummaryResponseDto {
  const deposits = roundMoney(row?.deposits ?? 0);
  const withdrawals = roundMoney(row?.withdrawals ?? 0);
  return { deposits, withdrawals, net: roundMoney(deposits - withdrawals), count: row?.count ?? 0 };
}
