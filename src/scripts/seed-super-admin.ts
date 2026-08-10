import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as argon2 from 'argon2';
import { AppModule } from '../app.module';
import { User, UserDocument } from '../modules/users/schemas/user.schema';
import { UserRole } from '../shared/auth/enums/user-role.enum';

async function seedSuperAdmin() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const config = app.get(ConfigService);
    const username = config.get<string>('SUPER_ADMIN_USERNAME');
    const password = config.get<string>('SUPER_ADMIN_PASSWORD');

    if (!username || !password) {
      throw new Error(
        'SUPER_ADMIN_USERNAME and SUPER_ADMIN_PASSWORD must be set in the environment',
      );
    }

    const userModel = app.get<Model<UserDocument>>(getModelToken(User.name));
    const existing = await userModel
      .findOne({ role: UserRole.SUPER_ADMIN, isDeleted: false })
      .exec();

    if (existing) {
      console.log(`Super admin already exists (username=${existing.username}). Skipping.`);
      return;
    }

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await userModel.create({
      username,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      isDeleted: false,
    });

    console.log(`Super admin created (username=${username}).`);
  } finally {
    await app.close();
  }
}

seedSuperAdmin().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
