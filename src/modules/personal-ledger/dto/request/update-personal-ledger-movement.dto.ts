import { PartialType } from '@nestjs/mapped-types';
import { CreatePersonalLedgerMovementDto } from './create-personal-ledger-movement.dto';

export class UpdatePersonalLedgerMovementDto extends PartialType(CreatePersonalLedgerMovementDto, {
  skipNullProperties: false,
}) {}
