import { Types } from 'mongoose';
import { PersonalLedgerContact } from '../schemas/personal-ledger-contact.schema';
import { PersonalLedgerMovement } from '../schemas/personal-ledger-movement.schema';

export type LedgerContactRow = PersonalLedgerContact & { _id: Types.ObjectId };
export type LedgerMovementRow = PersonalLedgerMovement & { _id: Types.ObjectId; contactName?: string };
export type LedgerSummaryRow = { deposits: number; withdrawals: number; count: number };
export type LedgerMovementFacet = {
  items: LedgerMovementRow[];
  totals: LedgerSummaryRow[];
};
