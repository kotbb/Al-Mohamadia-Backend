import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import * as argon2 from 'argon2';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import { UserRole } from '../src/shared/auth/enums/user-role.enum';
import { User, UserDocument } from '../src/modules/users/schemas/user.schema';

export type E2eApp = {
  app: INestApplication;
  replSet: MongoMemoryReplSet;
};

function applyE2eEnv(mongoUri: string): void {
  process.env.NODE_ENV = 'test';
  process.env.MONGO_URI = mongoUri;
  process.env.JWT_ACCESS_SECRET = 'e2e-access-secret';
  process.env.JWT_REFRESH_SECRET = 'e2e-refresh-secret';
  process.env.JWT_ACCESS_EXPIRES_IN = '10m';
  process.env.JWT_REFRESH_EXPIRES_IN = '21d';
  process.env.PUBLIC_API_BASE_URL = 'http://localhost:3000';
}

export async function createE2eApp(): Promise<E2eApp> {
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
  });
  applyE2eEnv(replSet.getUri());
  jest.resetModules();

  const { ValidationPipe } = require('@nestjs/common') as typeof import('@nestjs/common');
  const { Test } = require('@nestjs/testing') as typeof import('@nestjs/testing');
  const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();

  return { app, replSet };
}

export async function closeE2eApp(e2e: E2eApp | undefined): Promise<void> {
  if (!e2e) {
    return;
  }
  await e2e.app.close();
  await e2e.replSet.stop();
  jest.resetModules();
}

export async function insertAdmin(app: INestApplication, username: string, password: string): Promise<void> {
  const userModel = app.get<Model<UserDocument>>(getModelToken(User.name));
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await userModel.create({
    username,
    firstName: 'E2E',
    lastName: 'Admin',
    passwordHash,
    role: UserRole.ADMIN,
    isActive: true,
    isDeleted: false,
  });
}
