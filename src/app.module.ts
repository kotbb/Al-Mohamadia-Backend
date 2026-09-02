import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from './modules/audit/audit.module';
import { AppExceptionsHandler } from './shared/filters/app-exception.filter';
import { HealthModule } from './modules/health/health.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ItemsModule } from './modules/items/items.module';
import { SettingsModule } from './modules/settings/settings.module';
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
    CategoriesModule,
    ItemsModule,
    SettingsModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AppExceptionsHandler }],
})
export class AppModule {}
