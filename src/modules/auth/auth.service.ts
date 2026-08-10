import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { UsersService } from '../users/users.service';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { LoginDto } from './dto/login.dto';
import { AuthTokensResponseDto } from './dto/auth-tokens-response.dto';
import { LogoutResponseDto } from './dto/logout-response.dto';
import { RefreshToken, RefreshTokenDocument } from './schemas/refresh-token.schema';
import { parseDurationMs } from '../../shared/utils/parse-duration/parse-duration.util';
import { AccessTokenPayload } from '../../shared/auth/interfaces/access-token-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: Model<RefreshTokenDocument>,
  ) {}

  public async login(dto: LoginDto): Promise<AuthTokensResponseDto> {
    const user = await this.usersService.findByUsernameForAuth(dto.username);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    return this.issueTokenPair(user._id.toString(), this.usersService.toUserResponseDto(user));
  }

  public async refresh(rawRefreshToken: string): Promise<AuthTokensResponseDto> {
    const tokenHash = this.hashToken(rawRefreshToken);
    const stored = await this.refreshTokenModel.findOne({ tokenHash }).exec();

    if (!stored || !stored.isActive) {
      if (stored) {
        await this.refreshTokenModel.deleteOne({ _id: stored._id }).exec();
      }
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.usersService.findByIdForAuth(stored.userId.toString());
    if (!user || !user.isActive) {
      await this.refreshTokenModel.deleteOne({ _id: stored._id }).exec();
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.refreshTokenModel.deleteOne({ _id: stored._id }).exec();
    return this.issueTokenPair(user._id.toString(), this.usersService.toUserResponseDto(user));
  }

  public async logout(refreshToken: string): Promise<LogoutResponseDto> {
    const tokenHash = this.hashToken(refreshToken);
    await this.refreshTokenModel.deleteOne({ tokenHash }).exec();
    return { loggedOut: true };
  }

  //----------------------------- Helper Methods -----------------------------
  private async issueTokenPair(userId: string, user: UserResponseDto): Promise<AuthTokensResponseDto> {
    const accessExpiresIn = this.configService.getOrThrow<string>('JWT_ACCESS_EXPIRES_IN');
    const refreshExpiresIn = this.configService.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN');

    const payload: AccessTokenPayload = {
      id: userId,
      username: user.username,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: accessExpiresIn as `${number}${'s' | 'm' | 'h' | 'd'}`,
    });

    const refreshToken = randomBytes(48).toString('base64url');
    const tokenHash = this.hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + parseDurationMs(refreshExpiresIn));

    await this.refreshTokenModel.create({
      userId,
      tokenHash,
      expiresAt,
      revokedAt: null,
    });

    return { accessToken, refreshToken, user };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
