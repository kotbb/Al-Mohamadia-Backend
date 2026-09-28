import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module';
import { Category, CategorySchema } from '../categories/schemas/category.schema';
import { Item, ItemSchema } from '../items/schemas/item.schema';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Item.name, schema: ItemSchema },
      { name: Category.name, schema: CategorySchema },
    ]),
    AuditModule,
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService, MongooseModule],
})
export class InventoryModule {}
