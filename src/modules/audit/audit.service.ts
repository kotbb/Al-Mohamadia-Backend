import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { UserRole } from '../../shared/auth/enums/user-role.enum';
import { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { cairoInclusiveDateBounds } from '../../shared/utils/period/cairo-period.util';
import { User, UserDocument } from '../users/schemas/user.schema';
import { AuditActorDto, AuditLogListResponseDto, AuditLogResponseDto } from './dto/audit-log-response.dto';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';
import { AuditEntityType, isUserAuditAction } from './audit.constants';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';

@Injectable()
export class AuditService {
  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  // Log Audit
  public async log(dto: CreateAuditLogDto, session?: ClientSession): Promise<AuditLog> {
    const doc = new this.auditLogModel(dto);
    return doc.save({ session });
  }

  // Find all audit logs
  public async findAll(query: ListAuditLogsQueryDto, caller: AuthUser): Promise<AuditLogListResponseDto> {
    this.assertAdminListAccess(query, caller);

    if (query.from && query.to && query.from > query.to) {
      throw new BadRequestException('from must be on or before to');
    }

    const filter: {
      userId?: Types.ObjectId;
      action?: string;
      entityType?: string;
      entityId?: Types.ObjectId;
      createdAt?: { $gte?: Date; $lt?: Date };
    } = {};

    if (query.userId) {
      filter.userId = new Types.ObjectId(query.userId);
    }
    if (query.action) {
      filter.action = query.action;
    }
    if (query.entityType) {
      filter.entityType = query.entityType;
    }
    if (query.entityId) {
      filter.entityId = new Types.ObjectId(query.entityId);
    }

    if (query.from || query.to) {
      try {
        const bounds = cairoInclusiveDateBounds(query.from, query.to);
        const createdAt: { $gte?: Date; $lt?: Date } = {};
        if (bounds.gte) {
          createdAt.$gte = bounds.gte;
        }
        if (bounds.lt) {
          createdAt.$lt = bounds.lt;
        }
        filter.createdAt = createdAt;
      } catch {
        throw new BadRequestException('Invalid date');
      }
    }

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 100);
    const skip = (page - 1) * limit;

    const [docs, total] = await Promise.all([
      this.auditLogModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.auditLogModel.countDocuments(filter).exec(),
    ]);

    const usernames = await this.loadUsernames(docs.map((doc) => doc.userId));

    const items: AuditLogResponseDto[] = docs.map((doc) => ({
      id: doc._id.toString(),
      createdAt: doc.get('createdAt') as Date,
      user: this.toUserRef(doc.userId, usernames),
      action: doc.action,
      entityType: doc.entityType,
      entityId: doc.entityId.toString(),
      summary: doc.summary,
      changes: doc.changes,
      refCollection: doc.refCollection,
      refId: doc.refId ? doc.refId.toString() : null,
    }));

    return {
      items,
      meta: {
        page,
        limit,
        total,
      },
    };
  }

  // List actors
  public async listActors(): Promise<AuditActorDto[]> {
    const userIds = await this.auditLogModel.distinct('userId').exec();
    if (userIds.length === 0) {
      return [];
    }

    const usernames = await this.loadUsernames(userIds);
    const actors = userIds.map((userId) => this.toUserRef(userId, usernames));

    actors.sort((a, b) => {
      if (a.username === null && b.username === null) {
        return a.id.localeCompare(b.id);
      }
      if (a.username === null) {
        return -1;
      }
      if (b.username === null) {
        return 1;
      }
      const byName = a.username.localeCompare(b.username);
      return byName !== 0 ? byName : a.id.localeCompare(b.id);
    });

    return actors;
  }

  // ---------------- Helpers ----------------

  private assertAdminListAccess(query: ListAuditLogsQueryDto, caller: AuthUser): void {
    if (caller.role === UserRole.SUPER_ADMIN) return;

    if (query.userId && query.userId !== caller.id) {
      throw new ForbiddenException('You can only filter your own audit entries');
    }
    if (query.entityType === AuditEntityType.User || (query.action && isUserAuditAction(query.action))) {
      throw new ForbiddenException('You cannot filter user-management audit entries');
    }
  }

  // Load usernames
  private async loadUsernames(ids: Types.ObjectId[]): Promise<Map<string, string>> {
    if (ids.length === 0) {
      return new Map();
    }

    const users = await this.userModel
      .find({ _id: { $in: ids } })
      .select('username')
      .exec();
    return new Map(users.map((user) => [user._id.toString(), user.username]));
  }

  // To user ref
  private toUserRef(userId: Types.ObjectId, usernames: Map<string, string>): AuditActorDto {
    const id = userId.toString();
    return {
      id,
      username: usernames.get(id) ?? null,
    };
  }
}
