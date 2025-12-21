import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserProfile(userId: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.mapUserToResponse(user);
  }

  async updateUserProfile(
    userId: string,
    dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    try {
      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(dto.displayName !== undefined && {
            displayName: dto.displayName,
          }),
          ...(dto.preferredLanguage !== undefined && {
            preferredLanguage: dto.preferredLanguage,
          }),
          ...(dto.allowDataCollection !== undefined && {
            allowDataCollection: dto.allowDataCollection,
          }),
        },
      });

      return this.mapUserToResponse(updatedUser);
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException('User not found');
      }
      throw error;
    }
  }

  private mapUserToResponse(user: {
    id: string;
    email: string;
    displayName: string | null;
    preferredLanguage: string | null;
    isPremium: boolean;
    allowDataCollection: boolean | null;
    createdAt: Date;
  }): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      preferredLanguage: user.preferredLanguage || 'es',
      isPremium: user.isPremium,
      allowDataCollection: user.allowDataCollection,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async registerPushToken(
    userId: string,
    dto: { token: string; deviceId: string; platform: string },
  ): Promise<void> {
    await this.prisma.userPushToken.upsert({
      where: {
        userId_deviceId: {
          userId,
          deviceId: dto.deviceId,
        },
      },
      update: {
        token: dto.token,
        platform: dto.platform,
      },
      create: {
        userId,
        token: dto.token,
        deviceId: dto.deviceId,
        platform: dto.platform,
      },
    });
  }

  async deletePushToken(userId: string, deviceId: string): Promise<void> {
    await this.prisma.userPushToken.deleteMany({
      where: {
        userId,
        deviceId,
      },
    });
  }

  async getNotificationPreferences(
    userId: string,
  ): Promise<{ dailyArtEnabled: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { dailyArtEnabled: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return { dailyArtEnabled: user.dailyArtEnabled };
  }

  async updateNotificationPreferences(
    userId: string,
    dto: { dailyArtEnabled?: boolean },
  ): Promise<{ dailyArtEnabled: boolean }> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.dailyArtEnabled !== undefined && {
          dailyArtEnabled: dto.dailyArtEnabled,
        }),
      },
      select: { dailyArtEnabled: true },
    });

    return { dailyArtEnabled: user.dailyArtEnabled };
  }
}
