import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { DeleteAccountResponseDto } from './dto/delete-account-response.dto';
import { SupabaseService } from '../../supabase/supabase.service';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseService: SupabaseService,
  ) {}

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

  /**
   * Delete user account with GDPR/CCPA compliance
   * - Deletes user from Supabase Auth
   * - Anonymizes personal data in PostgreSQL
   * - Preserves financial records (anonymized) for legal compliance
   * - Preserves collection items with images (userId set to null)
   * - Deletes push tokens (CASCADE)
   */
  async deleteAccount(
    userId: string,
    dto: DeleteAccountDto,
  ): Promise<DeleteAccountResponseDto> {
    this.logger.log(`Starting account deletion for user: ${userId}`);

    // Step 1: Validate confirmation user ID
    if (userId !== dto.confirmationUserId) {
      throw new BadRequestException(
        'Confirmation user ID does not match authenticated user',
      );
    }

    // Step 2: Get user data for deletion process
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const deletedAt = new Date();
    const anonymizedEmail = `deleted_${userId}@deleted.travelai.com`;

    try {
      // Step 3: Delete from Supabase Auth (external service)
      // Continue even if this fails - user data will still be anonymized
      try {
        await this.supabaseService.deleteAuthUser(userId);
        this.logger.log(`Deleted Supabase Auth user: ${userId}`);
      } catch (error) {
        this.logger.warn(
          `Failed to delete Supabase Auth user ${userId}, continuing with anonymization`,
          error,
        );
      }

      // Step 4: Anonymize user data in database (atomic transaction)
      await this.prisma.$transaction(async (tx) => {
        // Delete push tokens (CASCADE delete)
        const deletedTokens = await tx.userPushToken.deleteMany({
          where: { userId },
        });
        this.logger.log(
          `Deleted ${deletedTokens.count} push tokens for user ${userId}`,
        );

        // Update collection items to disconnect from user (preserves images)
        const updatedItems = await tx.userCollectionItem.updateMany({
          where: { userId },
          data: { userId: null },
        });
        this.logger.log(
          `Preserved ${updatedItems.count} collection items (anonymized) for user ${userId}`,
        );

        // Anonymize user record (subscriptions/purchases CASCADE with anonymized userId)
        await tx.user.update({
          where: { id: userId },
          data: {
            email: anonymizedEmail,
            displayName: null,
            preferredLanguage: null,
            allowDataCollection: null,
            dailyArtEnabled: false,
            stripeCustomerId: null,
            isPremium: false,
            deletedAt,
          },
        });

        this.logger.log(`Anonymized user data for: ${userId}`);
      });

      this.logger.log(`Successfully deleted account for user: ${userId}`);

      return {
        success: true,
        message: 'Your account has been successfully deleted',
        deletedAt: deletedAt.toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `Error deleting account for user ${userId}:`,
        error.stack,
      );
      throw error;
    }
  }
}
