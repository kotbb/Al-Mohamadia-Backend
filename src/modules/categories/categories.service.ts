import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Category, CategoryDocument } from './schemas/category.schema';
import { CreateCategoryDto } from './dto/request/create-category.dto';
import { UpdateCategoryDto } from './dto/request/update-category.dto';
import { CategoryResponseDto } from './dto/response/category-response.dto';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { checkMongoId } from '../../shared/utils/check-mongo-id/check-mongo-id.util';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly auditService: AuditService,
  ) {}

  // Create Category
  public async create(dto: CreateCategoryDto, user: AuthUser): Promise<CategoryResponseDto> {
    const trimmedName = dto.name.trim();
    const existing = await this.categoryModel.findOne({ name: trimmedName, isDeleted: false }).lean().exec();
    if (existing) {
      throw new ConflictException('Category name already exists');
    }

    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const [created] = await this.categoryModel.create(
        [
          {
            name: trimmedName,
            isActive: true,
            isDeleted: false,
          },
        ],
        { session },
      );

      await this.auditService.log(
        {
          userId: user.id,
          action: 'category_created',
          entityType: 'Category',
          entityId: created._id.toString(),
          changes: {
            name: { old: null, new: created.name },
            isActive: { old: null, new: true },
          },
          refCollection: null,
          refId: null,
          summary: `Category created: ${created.name}`,
        },
        session,
      );

      await session.commitTransaction();
      return this.toResponseDto(created);
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Find All Categories
  public async findAll(): Promise<CategoryResponseDto[]> {
    const categories = await this.categoryModel.find({ isDeleted: false }).sort({ createdAt: 1, _id: 1 }).exec();
    return categories.map((category) => this.toResponseDto(category));
  }

  // Find One Category
  public async findOne(id: string): Promise<CategoryResponseDto> {
    const category = await this.categoryModel.findOne({ _id: id, isDeleted: false }).exec();
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return this.toResponseDto(category);
  }

  // Update Category
  public async update(id: string, dto: UpdateCategoryDto, user: AuthUser): Promise<CategoryResponseDto> {
    const category = await this.categoryModel.findOne({ _id: id, isDeleted: false }).exec();
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const changes: Record<string, { old: unknown; new: unknown }> = {};

    if (dto.name !== undefined) {
      const trimmedName = dto.name.trim();
      if (trimmedName !== category.name) {
        const existing = await this.categoryModel
          .findOne({
            name: trimmedName,
            isDeleted: false,
            _id: { $ne: id },
          })
          .lean()
          .exec();
        if (existing) {
          throw new ConflictException('Category name already exists');
        }
        changes.name = { old: category.name, new: trimmedName };
        category.name = trimmedName;
      }
    }

    if (dto.isActive !== undefined && dto.isActive !== category.isActive) {
      changes.isActive = { old: category.isActive, new: dto.isActive };
      category.isActive = dto.isActive;
    }

    if (Object.keys(changes).length === 0) {
      return this.toResponseDto(category);
    }

    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      await category.save({ session });

      await this.auditService.log(
        {
          userId: user.id,
          action: 'category_edited',
          entityType: 'Category',
          entityId: category._id.toString(),
          changes,
          refCollection: null,
          refId: null,
          summary: `Category edited: ${category.name}`,
        },
        session,
      );

      await session.commitTransaction();
      return this.toResponseDto(category);
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Soft Delete Category
  public async softDelete(id: string, user: AuthUser): Promise<CategoryResponseDto> {
    const category = await this.categoryModel.findOne({ _id: id, isDeleted: false }).exec();
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const itemCount = await this.connection.collection('items').countDocuments({
      categoryId: new Types.ObjectId(id),
      isDeleted: false,
    });
    if (itemCount > 0) {
      throw new ConflictException('Category has items, cannot be deleted');
    }

    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const oldIsActive = category.isActive;
      category.isDeleted = true;
      category.isActive = false;
      await category.save({ session });

      await this.auditService.log(
        {
          userId: user.id,
          action: 'category_deleted',
          entityType: 'Category',
          entityId: category._id.toString(),
          changes: {
            isDeleted: { old: false, new: true },
            isActive: { old: oldIsActive, new: false },
          },
          refCollection: null,
          refId: null,
          summary: `Category deleted: ${category.name}`,
        },
        session,
      );

      await session.commitTransaction();
      return this.toResponseDto(category);
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Find Active By Id
  public async findActiveById(id: string): Promise<CategoryDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    return this.categoryModel.findOne({ _id: id, isDeleted: false }).exec();
  }

  // ----------------- Helper Methods -----------------
  private toResponseDto(category: CategoryDocument): CategoryResponseDto {
    return {
      id: category._id.toString(),
      name: category.name,
      isActive: category.isActive,
      isDeleted: category.isDeleted,
      createdAt: category.get('createdAt') as Date | undefined,
      updatedAt: category.get('updatedAt') as Date | undefined,
    };
  }
}
