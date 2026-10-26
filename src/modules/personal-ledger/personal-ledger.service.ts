import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import type { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
import { CreatePersonalLedgerContactDto } from './dto/request/create-personal-ledger-contact.dto';
import { UpdatePersonalLedgerContactDto } from './dto/request/update-personal-ledger-contact.dto';
import { ListPersonalLedgerContactsQueryDto } from './dto/request/list-personal-ledger-contacts-query.dto';
import { CreatePersonalLedgerMovementDto } from './dto/request/create-personal-ledger-movement.dto';
import { UpdatePersonalLedgerMovementDto } from './dto/request/update-personal-ledger-movement.dto';
import { ListPersonalLedgerMovementsQueryDto } from './dto/request/list-personal-ledger-movements-query.dto';
import {
  PersonalLedgerContactDetailDto,
  PersonalLedgerContactListResponseDto,
  PersonalLedgerContactResponseDto,
} from './dto/response/personal-ledger-contact-response.dto';
import {
  PersonalLedgerDeletedResponseDto,
  PersonalLedgerMovementListResponseDto,
  PersonalLedgerMovementResponseDto,
} from './dto/response/personal-ledger-movement-response.dto';
import { PersonalLedgerContact, PersonalLedgerContactDocument } from './schemas/personal-ledger-contact.schema';
import { PersonalLedgerMovement, PersonalLedgerMovementDocument } from './schemas/personal-ledger-movement.schema';
import type { LedgerMovementFacet, LedgerSummaryRow } from './types/personal-ledger.types';
import { validateLedgerRange, validateMovementDate } from './utils/personal-ledger-date.util';
import { ledgerMovementFilter, ledgerSearchExpression, ledgerSummaryStages } from './utils/personal-ledger-query.util';
import {
  ledgerContactResponse,
  ledgerMovementResponse,
  ledgerSummaryResponse,
} from './utils/personal-ledger-response.util';

@Injectable()
export class PersonalLedgerService implements OnModuleInit {
  constructor(
    @InjectModel(PersonalLedgerContact.name) private readonly contacts: Model<PersonalLedgerContactDocument>,
    @InjectModel(PersonalLedgerMovement.name) private readonly movements: Model<PersonalLedgerMovementDocument>,
    @InjectModel(Customer.name) private readonly customers: Model<CustomerDocument>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  public async onModuleInit(): Promise<void> {
    // Ensure the new collections/indexes exist before transactional writes.
    await Promise.all([this.contacts.init(), this.movements.init()]);
  }

  public async listContacts(query: ListPersonalLedgerContactsQueryDto): Promise<PersonalLedgerContactListResponseDto> {
    const { page = 1, limit = 10 } = query;
    const filter = {
      ...(!query.includeInactive ? { isActive: true } : {}),
      ...(query.q?.trim() ? { name: ledgerSearchExpression(query.q) } : {}),
    };
    const [rows, total] = await Promise.all([
      this.contacts
        .find(filter)
        .sort({ name: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.contacts.countDocuments(filter),
    ]);
    return { items: rows.map(ledgerContactResponse), meta: { page, limit, total } };
  }

  public async createContact(
    dto: CreatePersonalLedgerContactDto,
    actor: AuthUser,
  ): Promise<PersonalLedgerContactResponseDto> {
    if ((dto.name !== undefined) === (dto.customerId !== undefined)) {
      throw new BadRequestException('Provide either a personal name or a customerId');
    }
    return this.connection.transaction(async (session) => {
      let name = dto.name?.trim();
      if (dto.customerId) {
        const existing = await this.contacts.findOne({ customerId: dto.customerId }).session(session).exec();
        if (existing) {
          if (!existing.isActive) throw new ConflictException('Reactivate the archived ledger contact first');
          return ledgerContactResponse(existing);
        }
        const customer = await this.customers
          .findOne({ _id: dto.customerId, isActive: true, isDeleted: false })
          .session(session)
          .exec();
        if (!customer) throw new NotFoundException('Active customer not found');
        name = customer.name;
      }
      if (!name) throw new BadRequestException('A person name is required');
      const [row] = await this.contacts.create(
        [{ name, customerId: dto.customerId ?? null, createdBy: actor.id, updatedBy: actor.id }],
        { session },
      );
      return ledgerContactResponse(row);
    });
  }

  public async updateContact(
    id: string,
    dto: UpdatePersonalLedgerContactDto,
    actor: AuthUser,
  ): Promise<PersonalLedgerContactResponseDto> {
    return this.connection.transaction(async (session) => {
      const row = await this.contacts.findById(id).session(session).exec();
      if (!row) throw new NotFoundException('Ledger contact not found');
      if (dto.name !== undefined) row.name = dto.name.trim();
      if (dto.isActive !== undefined) row.isActive = dto.isActive;
      if (row.isModified()) {
        row.updatedBy = new Types.ObjectId(actor.id);
        await row.save({ session });
      }
      return ledgerContactResponse(row);
    });
  }

  public async getContact(id: string): Promise<PersonalLedgerContactDetailDto> {
    const row = await this.contacts.findById(id).exec();
    if (!row) throw new NotFoundException('Ledger contact not found');
    const totals = await this.movements
      .aggregate<LedgerSummaryRow>([{ $match: { contactId: row._id, isDeleted: false } }, ...ledgerSummaryStages()])
      .exec();
    return { ...ledgerContactResponse(row), summary: ledgerSummaryResponse(totals[0]) };
  }

  public async listMovements(
    query: ListPersonalLedgerMovementsQueryDto,
  ): Promise<PersonalLedgerMovementListResponseDto> {
    validateLedgerRange(query.from, query.to);
    const { page = 1, limit = 10 } = query;
    const [result] = await this.movements
      .aggregate<LedgerMovementFacet>([
        ...ledgerMovementFilter(query),
        {
          $facet: {
            items: [
              { $sort: { movementDate: -1, createdAt: -1, _id: -1 } },
              { $skip: (page - 1) * limit },
              { $limit: limit },
            ],
            totals: ledgerSummaryStages(),
          },
        },
      ])
      .exec();
    const summary = ledgerSummaryResponse(result?.totals[0]);
    return {
      items: (result?.items ?? []).map((row) => ledgerMovementResponse(row)),
      meta: { page, limit, total: summary.count },
      summary,
    };
  }

  public async createMovement(
    dto: CreatePersonalLedgerMovementDto,
    actor: AuthUser,
  ): Promise<PersonalLedgerMovementResponseDto> {
    validateMovementDate(dto.movementDate);
    return this.connection.transaction(async (session) => {
      const contact = await this.findContact(dto.contactId, session);
      if (!contact.isActive) throw new ConflictException('Reactivate the archived ledger contact first');
      const [row] = await this.movements.create(
        [
          {
            ...dto,
            method: dto.method ?? null,
            notes: dto.notes?.trim() || null,
            createdBy: actor.id,
            updatedBy: actor.id,
          },
        ],
        { session },
      );
      return ledgerMovementResponse(row, contact.name);
    });
  }

  public async getMovement(id: string): Promise<PersonalLedgerMovementResponseDto> {
    const row = await this.movements.findOne({ _id: id, isDeleted: false }).exec();
    if (!row) throw new NotFoundException('Ledger movement not found');
    const contact = await this.contacts.findById(row.contactId).exec();
    return ledgerMovementResponse(row, contact?.name ?? '');
  }

  public async updateMovement(
    id: string,
    dto: UpdatePersonalLedgerMovementDto,
    actor: AuthUser,
  ): Promise<PersonalLedgerMovementResponseDto> {
    if (dto.movementDate !== undefined) validateMovementDate(dto.movementDate);
    return this.connection.transaction(async (session) => {
      const row = await this.movements.findOne({ _id: id, isDeleted: false }).session(session).exec();
      if (!row) throw new NotFoundException('Ledger movement not found');
      const originalContact = await this.findContact(row.contactId.toString(), session);
      const contactId = dto.contactId ?? row.contactId.toString();
      const changingContact = contactId !== row.contactId.toString();
      const contact = changingContact ? await this.findContact(contactId, session) : originalContact;
      if (changingContact && !contact.isActive)
        throw new ConflictException('Reactivate the archived ledger contact first');
      row.contactId = contact._id;
      if (dto.type !== undefined) row.type = dto.type;
      if (dto.amount !== undefined) row.amount = dto.amount;
      if (dto.movementDate !== undefined) row.movementDate = dto.movementDate;
      if (dto.method !== undefined) row.method = dto.method;
      if (dto.notes !== undefined) row.notes = dto.notes?.trim() || null;
      if (row.isModified()) {
        row.updatedBy = new Types.ObjectId(actor.id);
        await row.save({ session });
      }
      return ledgerMovementResponse(row, contact.name);
    });
  }

  public async deleteMovement(id: string, actor: AuthUser): Promise<PersonalLedgerDeletedResponseDto> {
    return this.connection.transaction(async (session) => {
      const row = await this.movements.findOne({ _id: id, isDeleted: false }).session(session).exec();
      if (!row) throw new NotFoundException('Ledger movement not found');
      row.isDeleted = true;
      row.updatedBy = new Types.ObjectId(actor.id);
      await row.save({ session });
      return { id };
    });
  }

  private async findContact(id: string, session: ClientSession): Promise<PersonalLedgerContactDocument> {
    const contact = await this.contacts.findById(id).session(session).exec();
    if (!contact) throw new NotFoundException('Ledger contact not found');
    return contact;
  }
}
