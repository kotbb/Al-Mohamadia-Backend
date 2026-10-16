import { categoryRefId, categoryRefName } from './utils/category-reference.util';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Item, ItemDocument } from './schemas/item.schema';
import { ItemPriceHistory, ItemPriceHistoryDocument } from './schemas/item-price-history.schema';
import { CreateItemDto } from './dto/request/create-item.dto';
import { UpdateItemDto } from './dto/request/update-item.dto';
import { UpdateItemPricingDto } from './dto/request/update-item-pricing.dto';
import { ItemResponseDto } from './dto/response/item-response.dto';
import { ItemPriceHistoryResponseDto } from './dto/response/item-price-history-response.dto';
import { AuditService } from '../audit/audit.service';
import { CategoriesService } from '../categories/categories.service';
import { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { checkMongoId } from '../../shared/utils/check-mongo-id/check-mongo-id.util';
import { roundMoney } from '../../shared/utils/round-money/round-money.util';
import { normalizeDimensionDefaults } from './utils/dimension-defaults.util';
import { AddDimensionDefaultDto } from './dto/request/add-dimension-default.dto';
import { ItemDimensionDefaultsResponseDto } from './dto/response/item-dimension-defaults-response.dto';

@Injectable()
export class ItemsService {
  constructor(
    @InjectModel(Item.name) private readonly itemModel: Model<ItemDocument>,
    @InjectModel(ItemPriceHistory.name)
    private readonly priceHistoryModel: Model<ItemPriceHistoryDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly auditService: AuditService,
    private readonly categoriesService: CategoriesService,
  ) {}

  // Create Item
  public async create(dto: CreateItemDto, user: AuthUser): Promise<ItemResponseDto> {
    const category = await this.categoriesService.findActiveById(dto.categoryId);
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const trimmedCode = dto.code.trim();
    const existing = await this.itemModel.findOne({ code: trimmedCode, isDeleted: false }).lean().exec();
    if (existing) {
      throw new ConflictException('Item code already exists');
    }

    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const [created] = await this.itemModel.create(
        [
          {
            code: trimmedCode,
            name: dto.name.trim(),
            categoryId: dto.categoryId,
            isWood: dto.isWood ?? false,
            pricingMode: dto.pricingMode,
            dimensionDefaults: normalizeDimensionDefaults(dto.dimensionDefaults),
            unitPrice: roundMoney(dto.unitPrice ?? 0),
            cost: roundMoney(dto.cost ?? 0),
            stockQuantity: dto.stockQuantity ?? 0,
            reorderThreshold: dto.reorderThreshold ?? 0,
            isActive: dto.isActive ?? true,
            isDeleted: false,
          },
        ],
        { session },
      );

      await this.auditService.log(
        {
          userId: user.id,
          action: 'item_created',
          entityType: 'Item',
          entityId: created._id.toString(),
          changes: {
            name: { old: null, new: created.name },
            categoryId: { old: null, new: category.name },
            pricingMode: { old: null, new: created.pricingMode },
            dimensionDefaults: { old: null, new: normalizeDimensionDefaults(created.dimensionDefaults) },
            unitPrice: { old: null, new: created.unitPrice },
            cost: { old: null, new: created.cost },
            stockQuantity: { old: null, new: created.stockQuantity },
          },
          refCollection: null,
          refId: null,
          summary: `Item created: ${created.name}`,
        },
        session,
      );

      await session.commitTransaction();
      await created.populate('categoryId', 'name');
      return this.toResponseDto(created);
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Find All Items
  public async findAll(categoryId?: string, isActive?: boolean): Promise<ItemResponseDto[]> {
    const filter: {
      isDeleted: boolean;
      categoryId?: string;
      isActive?: boolean;
    } = { isDeleted: false };

    if (categoryId !== undefined) {
      checkMongoId(categoryId, 'categoryId');
      filter.categoryId = categoryId;
    }

    if (isActive !== undefined) {
      filter.isActive = isActive;
    }

    const items = await this.itemModel.find(filter).populate('categoryId', 'name').sort({ name: 1 }).exec();

    return items.map((item) => this.toResponseDto(item));
  }

  // Find One Item
  public async findOne(id: string): Promise<ItemResponseDto> {
    const item = await this.itemModel.findOne({ _id: id, isDeleted: false }).populate('categoryId', 'name').exec();
    if (!item) {
      throw new NotFoundException('Item not found');
    }
    return this.toResponseDto(item);
  }

  // Update Item
  public async update(id: string, dto: UpdateItemDto, user: AuthUser): Promise<ItemResponseDto> {
    const item = await this.itemModel.findOne({ _id: id, isDeleted: false }).populate('categoryId', 'name').exec();
    if (!item) {
      throw new NotFoundException('Item not found');
    }

    const changes: Record<string, { old: unknown; new: unknown }> = {};

    if (dto.code !== undefined) {
      const trimmedCode = dto.code.trim();
      if (trimmedCode !== item.code) {
        const existing = await this.itemModel
          .findOne({
            code: trimmedCode,
            isDeleted: false,
            _id: { $ne: id },
          })
          .lean()
          .exec();
        if (existing) {
          throw new ConflictException('Item code already exists');
        }
        item.code = trimmedCode;
      }
    }

    if (dto.name !== undefined) {
      const trimmedName = dto.name.trim();
      if (trimmedName !== item.name) {
        changes.name = { old: item.name, new: trimmedName };
        item.name = trimmedName;
      }
    }

    if (dto.categoryId !== undefined) {
      checkMongoId(dto.categoryId, 'categoryId');
      const category = await this.categoriesService.findActiveById(dto.categoryId);
      if (!category) {
        throw new NotFoundException('Category not found');
      }
      const oldCategoryId = categoryRefId(item.categoryId);
      if (oldCategoryId !== dto.categoryId) {
        changes.categoryId = {
          old: categoryRefName(item.categoryId),
          new: category.name,
        };
        item.categoryId = category._id;
      }
    }

    if (dto.isWood !== undefined && dto.isWood !== item.isWood) {
      changes.isWood = { old: item.isWood, new: dto.isWood };
      item.isWood = dto.isWood;
    }

    if (dto.pricingMode !== undefined && dto.pricingMode !== item.pricingMode) {
      changes.pricingMode = { old: item.pricingMode, new: dto.pricingMode };
      item.pricingMode = dto.pricingMode;
    }

    if (dto.dimensionDefaults !== undefined) {
      const oldDefaults = normalizeDimensionDefaults(item.dimensionDefaults);
      const nextDefaults = normalizeDimensionDefaults(dto.dimensionDefaults);
      if (JSON.stringify(oldDefaults) !== JSON.stringify(nextDefaults)) {
        changes.dimensionDefaults = { old: oldDefaults, new: nextDefaults };
        item.dimensionDefaults = nextDefaults;
      }
    }

    if (dto.reorderThreshold !== undefined && dto.reorderThreshold !== item.reorderThreshold) {
      changes.reorderThreshold = {
        old: item.reorderThreshold,
        new: dto.reorderThreshold,
      };
      item.reorderThreshold = dto.reorderThreshold;
    }

    if (dto.isActive !== undefined && dto.isActive !== item.isActive) {
      changes.isActive = { old: item.isActive, new: dto.isActive };
      item.isActive = dto.isActive;
    }

    if (Object.keys(changes).length === 0) {
      return this.toResponseDto(item);
    }

    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      await item.save({ session });

      await this.auditService.log(
        {
          userId: user.id,
          action: 'item_edited',
          entityType: 'Item',
          entityId: item._id.toString(),
          changes,
          refCollection: null,
          refId: null,
          summary: `Item edited: ${item.name}`,
        },
        session,
      );

      await session.commitTransaction();
      await item.populate('categoryId', 'name');
      return this.toResponseDto(item);
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Soft Delete Item
  public async softDelete(id: string, user: AuthUser): Promise<ItemResponseDto> {
    const item = await this.itemModel.findOne({ _id: id, isDeleted: false }).populate('categoryId', 'name').exec();
    if (!item) {
      throw new NotFoundException('Item not found');
    }

    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const oldIsActive = item.isActive;
      item.isDeleted = true;
      item.isActive = false;
      await item.save({ session });

      await this.auditService.log(
        {
          userId: user.id,
          action: 'item_deleted',
          entityType: 'Item',
          entityId: item._id.toString(),
          changes: {
            isDeleted: { old: false, new: true },
            isActive: { old: oldIsActive, new: false },
          },
          refCollection: null,
          refId: null,
          summary: `Item deleted: ${item.name}`,
        },
        session,
      );

      await session.commitTransaction();
      return this.toResponseDto(item);
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Find Active Document By Id
  public async findActiveDocumentById(id: string): Promise<ItemDocument | null> {
    checkMongoId(id);
    return this.itemModel.findOne({ _id: id, isDeleted: false }).exec();
  }

  // Update Pricing
  public async updatePricing(id: string, dto: UpdateItemPricingDto, user: AuthUser): Promise<ItemResponseDto> {
    checkMongoId(id);

    if (dto.unitPrice === undefined && dto.cost === undefined) {
      throw new BadRequestException('At least one of unitPrice or cost is required');
    }

    const item = await this.itemModel.findOne({ _id: id, isDeleted: false }).exec();
    if (!item) {
      throw new NotFoundException('Item not found');
    }

    const pendingChanges: {
      field: 'unitPrice' | 'cost';
      oldValue: number;
      newValue: number;
    }[] = [];

    if (dto.unitPrice !== undefined) {
      const newValue = roundMoney(dto.unitPrice);
      if (newValue !== item.unitPrice) {
        pendingChanges.push({
          field: 'unitPrice',
          oldValue: item.unitPrice,
          newValue,
        });
      }
    }

    if (dto.cost !== undefined) {
      const newValue = roundMoney(dto.cost);
      if (newValue !== item.cost) {
        pendingChanges.push({
          field: 'cost',
          oldValue: item.cost,
          newValue,
        });
      }
    }

    if (pendingChanges.length === 0) {
      throw new BadRequestException('No pricing changes detected');
    }

    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      for (const change of pendingChanges) {
        const [history] = await this.priceHistoryModel.create(
          [
            {
              itemId: item._id,
              field: change.field,
              oldValue: change.oldValue,
              newValue: change.newValue,
              changedBy: user.id,
            },
          ],
          { session },
        );

        await this.auditService.log(
          {
            userId: user.id,
            action: 'price_changed',
            entityType: 'Item',
            entityId: item._id.toString(),
            changes: {
              [change.field]: { old: change.oldValue, new: change.newValue },
            },
            refCollection: 'ItemPriceHistory',
            refId: history._id.toString(),
            summary: `${change.field}: ${change.oldValue} → ${change.newValue}`,
          },
          session,
        );

        item[change.field] = change.newValue;
      }

      await item.save({ session });
      await session.commitTransaction();
      await item.populate('categoryId', 'name');
      return this.toResponseDto(item);
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Get Price History
  public async getPriceHistory(id: string): Promise<ItemPriceHistoryResponseDto[]> {
    checkMongoId(id);

    const item = await this.itemModel.findOne({ _id: id, isDeleted: false }).lean().exec();
    if (!item) {
      throw new NotFoundException('Item not found');
    }

    const history = await this.priceHistoryModel.find({ itemId: id }).sort({ createdAt: -1 }).exec();
    const actorIds = [...new Set(history.map((entry) => entry.changedBy.toString()))];
    const actors =
      actorIds.length === 0
        ? []
        : await this.connection
            .collection('users')
            .find({ _id: { $in: actorIds.map((actorId) => new Types.ObjectId(actorId)) } })
            .project({ username: 1 })
            .toArray();
    const usernames = new Map(
      actors.map((actor) => [actor._id.toString(), typeof actor.username === 'string' ? actor.username : null]),
    );

    return history.map((entry) => ({
      id: entry._id.toString(),
      itemId: entry.itemId.toString(),
      field: entry.field,
      oldValue: entry.oldValue,
      newValue: entry.newValue,
      changedBy: usernames.get(entry.changedBy.toString()) ?? null,
      createdAt: entry.get('createdAt') as Date | undefined,
    }));
  }

  // Add Dimension Default to item
  public async addDimensionDefault(
    id: string,
    dto: AddDimensionDefaultDto,
    user: AuthUser,
  ): Promise<ItemDimensionDefaultsResponseDto> {
    checkMongoId(id, 'itemId');

    return this.connection.transaction(async (session) => {
      const item = await this.itemModel.findOne({ _id: id, isDeleted: false }).session(session).exec();
      if (!item) throw new NotFoundException('Item not found');
      const oldDefaults = normalizeDimensionDefaults(item.dimensionDefaults);
      const nextDefaults = normalizeDimensionDefaults({
        ...oldDefaults,
        [dto.dimension]: [...oldDefaults[dto.dimension], dto.value],
      });
      if (JSON.stringify(oldDefaults) !== JSON.stringify(nextDefaults)) {
        item.dimensionDefaults = nextDefaults;
        await item.save({ session });
        await this.auditService.log(
          {
            userId: user.id,
            action: 'item_edited',
            entityType: 'Item',
            entityId: item._id.toString(),
            changes: { dimensionDefaults: { old: oldDefaults, new: nextDefaults } },
            refCollection: null,
            refId: null,
            summary: `Item dimension defaults updated: ${item.name}`,
          },
          session,
        );
      }
      return { itemId: item._id.toString(), dimensionDefaults: nextDefaults };
    });
  }

  // ----------------- Helper Methods -----------------
  private toResponseDto(item: ItemDocument): ItemResponseDto {
    const category = item.categoryId as unknown as {
      _id: { toString: () => string };
      name: string;
    };

    return {
      id: item._id.toString(),
      code: item.code,
      name: item.name,
      category: {
        id:
          typeof category === 'object' && category !== null && '_id' in category
            ? category._id.toString()
            : item.categoryId.toString(),
        name: typeof category === 'object' && category !== null && 'name' in category ? category.name : '',
      },
      isWood: item.isWood,
      pricingMode: item.pricingMode,
      dimensionDefaults: normalizeDimensionDefaults(item.dimensionDefaults),
      unitPrice: item.unitPrice,
      cost: item.cost,
      stockQuantity: item.stockQuantity,
      reorderThreshold: item.reorderThreshold,
      isActive: item.isActive,
      isDeleted: item.isDeleted,
      createdAt: item.get('createdAt') as Date | undefined,
      updatedAt: item.get('updatedAt') as Date | undefined,
    };
  }
}
