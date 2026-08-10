import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../../decorators/roles.decorator';
import { UserRole } from '../../enums/user-role.enum';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  const createContext = (user?: { role: UserRole }) =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as never;

  it('allows when no roles are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('allows matching role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) =>
      key === ROLES_KEY ? [UserRole.SUPER_ADMIN] : undefined,
    );
    expect(
      guard.canActivate(createContext({ role: UserRole.SUPER_ADMIN })),
    ).toBe(true);
  });

  it('forbids admin on super_admin-only routes', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) =>
      key === ROLES_KEY ? [UserRole.SUPER_ADMIN] : undefined,
    );
    expect(() =>
      guard.canActivate(createContext({ role: UserRole.ADMIN })),
    ).toThrow(ForbiddenException);
  });

  it('unauthorized when user missing but roles required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) =>
      key === ROLES_KEY ? [UserRole.SUPER_ADMIN] : undefined,
    );
    expect(() => guard.canActivate(createContext())).toThrow(
      UnauthorizedException,
    );
  });
});
