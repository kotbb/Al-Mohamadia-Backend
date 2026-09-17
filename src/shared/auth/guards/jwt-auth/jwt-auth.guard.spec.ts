import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../../decorators/public.decorator';
import { UserRole } from '../../enums/user-role.enum';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;
  let jwtService: { verifyAsync: jest.Mock };
  let configService: { getOrThrow: jest.Mock };

  beforeEach(() => {
    reflector = new Reflector();
    jwtService = { verifyAsync: jest.fn() };
    configService = {
      getOrThrow: jest.fn().mockReturnValue('access-secret'),
    };
    guard = new JwtAuthGuard(reflector, jwtService as unknown as JwtService, configService as unknown as ConfigService);
  });

  const createContext = (authorization?: string) => {
    const request: { headers: { authorization?: string }; user?: unknown } = {
      headers: { authorization },
    };
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      request,
    } as unknown as ExecutionContext & { request: typeof request };
  };

  it('allows public routes without a token', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => (key === IS_PUBLIC_KEY ? true : undefined));
    await expect(guard.canActivate(createContext())).resolves.toBe(true);
  });

  it('rejects missing bearer token', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    await expect(guard.canActivate(createContext())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('attaches user from a valid access token', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    jwtService.verifyAsync.mockResolvedValue({
      id: 'u1',
      username: 'boss',
      role: UserRole.SUPER_ADMIN,
    });

    const ctx = createContext('Bearer valid.token');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(ctx.request.user).toEqual({
      id: 'u1',
      username: 'boss',
      role: UserRole.SUPER_ADMIN,
    });
  });
});
