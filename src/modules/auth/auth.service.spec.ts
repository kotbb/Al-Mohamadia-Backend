import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '../../shared/auth/enums/user-role.enum';
import { createHash } from 'crypto';
import * as argon2 from 'argon2';

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: jest.Mocked<
    Pick<UsersService, 'findByUsernameForAuth' | 'findByIdForAuth' | 'toUserResponseDto'>
  >;
  let jwtService: jest.Mocked<Pick<JwtService, 'signAsync'>>;
  let configService: jest.Mocked<Pick<ConfigService, 'getOrThrow'>>;
  let refreshTokenModel: {
    findOne: jest.Mock;
    create: jest.Mock;
    deleteOne: jest.Mock;
  };

  const userResponse = {
    id: '507f1f77bcf86cd799439011',
    username: 'admin1',
    role: UserRole.ADMIN,
    isActive: true,
    isDeleted: false,
  };

  beforeEach(() => {
    usersService = {
      findByUsernameForAuth: jest.fn(),
      findByIdForAuth: jest.fn(),
      toUserResponseDto: jest.fn().mockReturnValue(userResponse),
    };

    jwtService = {
      signAsync: jest.fn().mockResolvedValue('access-token'),
    };

    configService = {
      getOrThrow: jest.fn((key: string) => {
        const map: Record<string, string> = {
          JWT_ACCESS_SECRET: 'access-secret',
          JWT_ACCESS_EXPIRES_IN: '10m',
          JWT_REFRESH_EXPIRES_IN: '21d',
        };
        return map[key];
      }),
    };

    refreshTokenModel = {
      findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      create: jest.fn().mockResolvedValue({}),
      deleteOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ deletedCount: 1 }) }),
    };

    authService = new AuthService(
      usersService as unknown as UsersService,
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
      refreshTokenModel as never,
    );
  });

  describe('login', () => {
    it('returns tokens on valid credentials', async () => {
      const passwordHash = await argon2.hash('password123', { type: argon2.argon2id });
      usersService.findByUsernameForAuth.mockResolvedValue({
        _id: { toString: () => userResponse.id },
        username: userResponse.username,
        role: UserRole.ADMIN,
        isActive: true,
        isDeleted: false,
        passwordHash,
      } as never);

      const result = await authService.login({
        username: 'admin1',
        password: 'password123',
      });

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBeDefined();
      expect(result.user).toEqual(userResponse);
      expect(refreshTokenModel.create).toHaveBeenCalled();
    });

    it('rejects unknown usernames', async () => {
      usersService.findByUsernameForAuth.mockResolvedValue(null);

      await expect(
        authService.login({ username: 'nobody', password: 'password123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects invalid password', async () => {
      const passwordHash = await argon2.hash('password123', { type: argon2.argon2id });
      usersService.findByUsernameForAuth.mockResolvedValue({
        _id: { toString: () => userResponse.id },
        passwordHash,
        isActive: true,
      } as never);

      await expect(
        authService.login({ username: 'admin1', password: 'wrong' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects inactive users', async () => {
      const passwordHash = await argon2.hash('password123', { type: argon2.argon2id });
      usersService.findByUsernameForAuth.mockResolvedValue({
        _id: { toString: () => userResponse.id },
        passwordHash,
        isActive: false,
      } as never);

      await expect(
        authService.login({ username: 'admin1', password: 'password123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('rotates refresh token and invalidates the old one', async () => {
      const raw = 'old-refresh-token';
      const tokenHash = createHash('sha256').update(raw).digest('hex');
      const stored = {
        _id: 'rt1',
        userId: { toString: () => userResponse.id },
        tokenHash,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        isActive: true,
        isExpired: false,
        isRevoked: false,
      };

      refreshTokenModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(stored),
      });
      usersService.findByIdForAuth.mockResolvedValue({
        _id: { toString: () => userResponse.id },
        isActive: true,
      } as never);

      const result = await authService.refresh(raw);

      expect(refreshTokenModel.deleteOne).toHaveBeenCalledWith({ _id: 'rt1' });
      expect(refreshTokenModel.create).toHaveBeenCalled();
      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).not.toBe(raw);
    });

    it('rejects unknown refresh tokens', async () => {
      refreshTokenModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(authService.refresh('missing')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects inactive refresh tokens and deletes them', async () => {
      const stored = {
        _id: 'rt-expired',
        userId: { toString: () => userResponse.id },
        isActive: false,
        isExpired: true,
        isRevoked: false,
      };

      refreshTokenModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(stored),
      });

      await expect(authService.refresh('expired-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(refreshTokenModel.deleteOne).toHaveBeenCalledWith({ _id: 'rt-expired' });
      expect(refreshTokenModel.create).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('hard-deletes the refresh token hash', async () => {
      const raw = 'logout-token';
      const tokenHash = createHash('sha256').update(raw).digest('hex');

      await expect(authService.logout(raw)).resolves.toEqual({ loggedOut: true });
      expect(refreshTokenModel.deleteOne).toHaveBeenCalledWith({ tokenHash });
    });
  });
});
