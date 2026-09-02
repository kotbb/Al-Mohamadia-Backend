import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ItemsService } from './items.service';
import { ItemsController } from './items.controller';
import { Item, ItemSchema } from './schemas/item.schema';
import { ItemPriceHistory, ItemPriceHistorySchema } from './schemas/item-price-history.schema';
import { AuditModule } from '../audit/audit.module';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Item.name, schema: ItemSchema },
      { name: ItemPriceHistory.name, schema: ItemPriceHistorySchema },
    ]),
    AuditModule,
    CategoriesModule,
  ],
  controllers: [ItemsController],
  providers: [ItemsService],
  exports: [ItemsService],
})
export class ItemsModule {}
