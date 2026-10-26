import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';
import { PersonalLedgerController } from './personal-ledger.controller';
import { PersonalLedgerService } from './personal-ledger.service';
import { PersonalLedgerContact, PersonalLedgerContactSchema } from './schemas/personal-ledger-contact.schema';
import { PersonalLedgerMovement, PersonalLedgerMovementSchema } from './schemas/personal-ledger-movement.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
      { name: PersonalLedgerContact.name, schema: PersonalLedgerContactSchema },
      { name: PersonalLedgerMovement.name, schema: PersonalLedgerMovementSchema },
    ]),
  ],
  controllers: [PersonalLedgerController],
  providers: [PersonalLedgerService],
})
export class PersonalLedgerModule {}
