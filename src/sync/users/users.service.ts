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
          ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
          ...(dto.preferredLanguage !== undefined && {
            preferredLanguage: dto.preferredLanguage,
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
    avatarUrl: string | null;
    preferredLanguage: string | null;
    isPremium: boolean;
    createdAt: Date;
  }): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      display_name: user.displayName,
      avatar_url: user.avatarUrl,
      preferred_language: user.preferredLanguage || 'es',
      is_premium: user.isPremium,
      created_at: user.createdAt.toISOString(),
    };
  }
}
