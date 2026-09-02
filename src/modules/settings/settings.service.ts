import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { Setting, SettingDocument } from './schemas/setting.schema';
import { UpdateBaseReferencePriceDto } from './dto/update-base-reference-price.dto';
import { SettingResponseDto } from './dto/setting-response.dto';
import { BALADI_WOOD_METER_PRICE_KEY } from './constants/setting-keys.constant';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { roundMoney } from '../../shared/utils/round-money/round-money.util';

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(Setting.name) private readonly settingModel: Model<SettingDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly auditService: AuditService,
  ) {}

  // Find Base Reference Price
  public async getBaseReferencePrice(): Promise<SettingResponseDto> {
    const setting = await this.settingModel.findOne({ key: BALADI_WOOD_METER_PRICE_KEY }).exec();

    if (!setting) {
      return {
        key: BALADI_WOOD_METER_PRICE_KEY,
        value: null,
      };
    }

    return {
      key: setting.key,
      value: setting.value,
      updatedAt: setting.get('updatedAt') as Date | undefined,
    };
  }

  // Update Base Reference Price
  public async updateBaseReferencePrice(dto: UpdateBaseReferencePriceDto, user: AuthUser): Promise<SettingResponseDto> {
    const newValue = roundMoney(dto.value);
    const existing = await this.settingModel.findOne({ key: BALADI_WOOD_METER_PRICE_KEY }).exec();

    const oldValue = existing?.value ?? null;

    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      let setting: SettingDocument;
      if (existing) {
        existing.value = newValue;
        await existing.save({ session });
        setting = existing;
      } else {
        const [created] = await this.settingModel.create([{ key: BALADI_WOOD_METER_PRICE_KEY, value: newValue }], {
          session,
        });
        setting = created;
      }

      await this.auditService.log(
        {
          userId: user.id,
          action: 'setting_changed',
          entityType: 'Setting',
          entityId: setting._id.toString(),
          changes: {
            value: { old: oldValue, new: newValue },
          },
          refCollection: null,
          refId: null,
          summary: `Base reference price: ${oldValue ?? 'unset'} → ${newValue}`,
        },
        session,
      );

      await session.commitTransaction();

      return {
        key: setting.key,
        value: setting.value,
        updatedAt: setting.get('updatedAt') as Date | undefined,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
}
