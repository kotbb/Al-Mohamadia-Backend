import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from './modules/audit/audit.module';
import { AppExceptionsHandler } from './shared/filters/app-exception.filter';
import { ResponseInterceptor } from './shared/interceptors/response.interceptor';
import { HealthModule } from './modules/health/health.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ItemsModule } from './modules/items/items.module';
import { SettingsModule } from './modules/settings/settings.module';
import { CustomersModule } from './modules/customers/customers.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { SalesInvoicesModule } from './modules/sales-invoices/sales-invoices.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { SupplierPaymentsModule } from './modules/supplier-payments/supplier-payments.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import * as Joi from 'joi';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: `.env`,
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        PORT: Joi.number().default(3000),
        MONGO_URI: Joi.string().required(),
        JWT_ACCESS_SECRET: Joi.string().required(),
        JWT_REFRESH_SECRET: Joi.string().required(),
        JWT_ACCESS_EXPIRES_IN: Joi.string().default('10m'),
        JWT_REFRESH_EXPIRES_IN: Joi.string().default('21d'),
        SUPER_ADMIN_USERNAME: Joi.string().optional(),
        SUPER_ADMIN_PASSWORD: Joi.string().optional(),
        PUBLIC_API_BASE_URL: Joi.string().uri().default('http://localhost:3000'),
      }),
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.getOrThrow<string>('MONGO_URI'),
      }),
    }),
    AuditModule,
    HealthModule,
    UsersModule,
    AuthModule,
    CustomersModule,
    SuppliersModule,
    CategoriesModule,
    ItemsModule,
    SettingsModule,
    SalesInvoicesModule,
    PaymentsModule,
    PurchasesModule,
    SupplierPaymentsModule,
    InventoryModule,
    DashboardModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AppExceptionsHandler },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}
