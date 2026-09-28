import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from './modules/audit/audit.module';
import { AppExceptionsHandler } from './shared/filters/app-exception.filter';
import { AppThrottlerGuard } from './shared/throttler/app-throttler.guard';
import { ResponseInterceptor } from './shared/interceptors/response.interceptor';
import { HealthModule } from './modules/health/health.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ItemsModule } from './modules/items/items.module';
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
        FRONTEND_URL: Joi.string().uri().optional(),
        CORS_ORIGIN: Joi.string().default('http://localhost:3001'),
        THROTTLE_DISABLED: Joi.boolean().default(false),
        THROTTLE_AUTH_LIMIT: Joi.number().integer().min(1).default(10),
        THROTTLE_GLOBAL_LIMIT: Joi.number().integer().min(1).default(300),
      }),
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.getOrThrow<string>('MONGO_URI'),
        maxPoolSize: 10,
      }),
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            name: 'auth',
            ttl: 60_000,
            limit: Number(configService.get('THROTTLE_AUTH_LIMIT') ?? 10),
          },
          {
            name: 'global',
            ttl: 60_000,
            limit: Number(configService.get('THROTTLE_GLOBAL_LIMIT') ?? 300),
          },
        ],
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
    SalesInvoicesModule,
    PaymentsModule,
    PurchasesModule,
    SupplierPaymentsModule,
    InventoryModule,
    DashboardModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AppExceptionsHandler },
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}
