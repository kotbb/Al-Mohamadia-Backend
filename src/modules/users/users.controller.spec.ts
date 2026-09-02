import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserRole } from '../../shared/auth/enums/user-role.enum';
import { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: {
    createAdmin: jest.Mock;
    findAll: jest.Mock;
    findMe: jest.Mock;
    updateUser: jest.Mock;
    softDelete: jest.Mock;
  };

  const actor: AuthUser = {
    id: '507f1f77bcf86cd799439099',
    username: 'super',
    role: UserRole.SUPER_ADMIN,
  };

  beforeEach(async () => {
    usersService = {
      createAdmin: jest.fn().mockResolvedValue({ id: '1' }),
      findAll: jest.fn().mockResolvedValue([]),
      findMe: jest.fn().mockResolvedValue({ id: actor.id }),
      updateUser: jest.fn().mockResolvedValue({ id: '1', isActive: false }),
      softDelete: jest.fn().mockResolvedValue({ id: '1', isDeleted: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates create to UsersService.createAdmin', async () => {
    const dto = {
      username: 'admin1',
      firstName: 'Admin',
      lastName: 'One',
      password: 'password123',
    };
    await controller.create(dto, actor);
    expect(usersService.createAdmin).toHaveBeenCalledWith(dto, actor);
  });

  it('delegates getAll to UsersService.findAll', async () => {
    await controller.getAll();
    expect(usersService.findAll).toHaveBeenCalled();
  });

  it('delegates getMe to UsersService.findMe', async () => {
    await controller.getMe(actor);
    expect(usersService.findMe).toHaveBeenCalledWith(actor.id);
  });

  it('delegates update to UsersService.updateUser', async () => {
    await controller.update('507f1f77bcf86cd799439011', { isActive: false }, actor);
    expect(usersService.updateUser).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      { isActive: false },
      actor,
    );
  });

  it('delegates remove to UsersService.softDelete', async () => {
    await controller.remove('507f1f77bcf86cd799439011', actor);
    expect(usersService.softDelete).toHaveBeenCalledWith('507f1f77bcf86cd799439011', actor);
  });
});
