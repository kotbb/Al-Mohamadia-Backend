import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module';
import { Category, CategorySchema } from '../categories/schemas/category.schema';
import { Item, ItemSchema } from '../items/schemas/item.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { StockAdjustment, StockAdjustmentSchema } from './schemas/stock-adjustment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StockAdjustment.name, schema: StockAdjustmentSchema },
      { name: Item.name, schema: ItemSchema },
      { name: Category.name, schema: CategorySchema },
      { name: User.name, schema: UserSchema },
    ]),
    AuditModule,
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService, MongooseModule],
})
export class InventoryModule {}
