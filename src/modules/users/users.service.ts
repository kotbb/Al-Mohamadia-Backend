import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import * as argon2 from 'argon2';
import { User, UserDocument } from './schemas/user.schema';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UserRole } from '../../shared/auth/enums/user-role.enum';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { checkMongoId } from '../../shared/utils/check-mongo-id/check-mongo-id.util';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly auditService: AuditService,
  ) {}

  public async createAdmin(dto: CreateAdminDto, user: AuthUser): Promise<UserResponseDto> {
    const existing = await this.userModel.findOne({ username: dto.username, isDeleted: false }).lean().exec();
    if (existing) {
      throw new ConflictException('Username already exists');
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const [created] = await this.userModel.create(
        [
          {
            username: dto.username,
            firstName: dto.firstName.trim(),
            lastName: dto.lastName.trim(),
            passwordHash,
            role: UserRole.ADMIN,
            isActive: true,
            isDeleted: false,
          },
        ],
        { session },
      );

      await this.auditService.log(
        {
          userId: user.id,
          action: 'admin_created',
          entityType: 'User',
          entityId: created._id.toString(),
          changes: {
            username: { old: null, new: created.username },
            firstName: { old: null, new: created.firstName },
            lastName: { old: null, new: created.lastName },
            role: { old: null, new: created.role },
            isActive: { old: null, new: true },
          },
          refCollection: null,
          refId: null,
          summary: `Admin created: ${created.username}`,
        },
        session,
      );

      await session.commitTransaction();
      return this.toUserResponseDto(created);
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  public async findAll(): Promise<UserResponseDto[]> {
    const users = await this.userModel.find({ isDeleted: false }).sort({ createdAt: 1 }).exec();
    return users.map((user) => this.toUserResponseDto(user));
  }

  public async findMe(userId: string): Promise<UserResponseDto> {
    checkMongoId(userId);
    const user = await this.userModel.findOne({ _id: userId, isDeleted: false }).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.toUserResponseDto(user);
  }

  public async updateUser(id: string, dto: UpdateUserDto, actor: AuthUser): Promise<UserResponseDto> {
    const user = await this.userModel.findOne({ _id: id, isDeleted: false }).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot modify super admin');
    }

    if (dto.username && dto.username !== user.username) {
      const existing = await this.userModel
        .findOne({ username: dto.username, isDeleted: false, _id: { $ne: user._id } })
        .lean()
        .exec();
      if (existing) {
        throw new ConflictException('Username already exists');
      }
      user.username = dto.username.trim();
    }

    if (dto.firstName !== undefined) {
      user.firstName = dto.firstName.trim();
    }
    if (dto.lastName !== undefined) {
      user.lastName = dto.lastName.trim();
    }
    if (dto.isActive !== undefined) {
      user.isActive = dto.isActive;
    }
    if (dto.password) {
      user.passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    }

    await user.save();

    await this.auditService.log({
      userId: actor.id,
      action: 'admin_updated',
      entityType: 'User',
      entityId: user._id.toString(),
      changes: {},
      refCollection: null,
      refId: null,
      summary: `Admin updated: ${user.username}`,
    });

    return this.toUserResponseDto(user);
  }

  public async softDelete(id: string, actor: AuthUser): Promise<UserResponseDto> {
    const user = await this.userModel.findOne({ _id: id, isDeleted: false }).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot delete super admin');
    }
    if (user._id.toString() === actor.id) {
      throw new ForbiddenException('Cannot delete your own account');
    }

    user.isDeleted = true;
    user.isActive = false;
    await user.save();

    await this.auditService.log({
      userId: actor.id,
      action: 'admin_deleted',
      entityType: 'User',
      entityId: user._id.toString(),
      changes: {
        isDeleted: { old: false, new: true },
      },
      refCollection: null,
      refId: null,
      summary: `Admin deleted: ${user.username}`,
    });

    return this.toUserResponseDto(user);
  }

  public async findByUsernameForAuth(username: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ username, isDeleted: false }).select('+passwordHash').exec();
  }

  public async findByIdForAuth(id: string): Promise<UserDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    return this.userModel.findOne({ _id: id, isDeleted: false }).exec();
  }

  public toUserResponseDto(user: UserDocument): UserResponseDto {
    return {
      id: user._id.toString(),
      username: user.username,
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      role: user.role,
      isActive: user.isActive,
      isDeleted: user.isDeleted,
      createdAt: user.get('createdAt') as Date | undefined,
      updatedAt: user.get('updatedAt') as Date | undefined,
    };
  }
}
