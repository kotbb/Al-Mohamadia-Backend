import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../shared/auth/decorators/current-user.decorator';
import { Roles } from '../../shared/auth/decorators/roles.decorator';
import { UserRole } from '../../shared/auth/enums/user-role.enum';
import type { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { ParseObjectIdPipe } from '../../shared/pipes/parse-object-id/parse-object-id.pipe';
import { PersonalLedgerService } from './personal-ledger.service';
import { CreatePersonalLedgerContactDto } from './dto/request/create-personal-ledger-contact.dto';
import { UpdatePersonalLedgerContactDto } from './dto/request/update-personal-ledger-contact.dto';
import { ListPersonalLedgerContactsQueryDto } from './dto/request/list-personal-ledger-contacts-query.dto';
import { CreatePersonalLedgerMovementDto } from './dto/request/create-personal-ledger-movement.dto';
import { UpdatePersonalLedgerMovementDto } from './dto/request/update-personal-ledger-movement.dto';
import { ListPersonalLedgerMovementsQueryDto } from './dto/request/list-personal-ledger-movements-query.dto';

@Controller('personal-ledger')
@Roles(UserRole.SUPER_ADMIN)
export class PersonalLedgerController {
  constructor(private readonly ledger: PersonalLedgerService) {}

  @Get('contacts')
  public listContacts(@Query() query: ListPersonalLedgerContactsQueryDto) {
    return this.ledger.listContacts(query);
  }

  @Post('contacts')
  public createContact(@Body() dto: CreatePersonalLedgerContactDto, @CurrentUser() actor: AuthUser) {
    return this.ledger.createContact(dto, actor);
  }

  @Get('contacts/:id')
  public getContact(@Param('id', ParseObjectIdPipe) id: string) {
    return this.ledger.getContact(id);
  }

  @Patch('contacts/:id')
  public updateContact(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdatePersonalLedgerContactDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.ledger.updateContact(id, dto, actor);
  }

  @Get('movements')
  public listMovements(@Query() query: ListPersonalLedgerMovementsQueryDto) {
    return this.ledger.listMovements(query);
  }

  @Post('movements')
  public createMovement(@Body() dto: CreatePersonalLedgerMovementDto, @CurrentUser() actor: AuthUser) {
    return this.ledger.createMovement(dto, actor);
  }

  @Get('movements/:id')
  public getMovement(@Param('id', ParseObjectIdPipe) id: string) {
    return this.ledger.getMovement(id);
  }

  @Patch('movements/:id')
  public updateMovement(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdatePersonalLedgerMovementDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.ledger.updateMovement(id, dto, actor);
  }

  @Delete('movements/:id')
  public deleteMovement(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() actor: AuthUser) {
    return this.ledger.deleteMovement(id, actor);
  }
}
