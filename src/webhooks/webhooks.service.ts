import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SupabaseWebhookDto } from './dto/supabase-webhook.dto';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private prisma: PrismaService) {}

  async handleUserCreated(payload: SupabaseWebhookDto): Promise<{
    success: boolean;
    message: string;
    userId: string;
  }> {
    // Validate event type
    if (payload.type !== 'INSERT') {
      throw new BadRequestException(
        `Invalid event type: ${payload.type}. Expected INSERT.`,
      );
    }

    // Validate table
    if (payload.table !== 'users') {
      throw new BadRequestException(
        `Invalid table: ${payload.table}. Expected users.`,
      );
    }

    const { id, email, raw_user_meta_data } = payload.record;

    if (!id || !email) {
      throw new BadRequestException('Missing required fields: id or email');
    }

    this.logger.log(`Processing user creation webhook for user: ${id}`);

    try {
      // Use upsert for idempotency - safe to receive duplicate webhook calls
      const user = await this.prisma.user.upsert({
        where: { id },
        update: {
          // Update email if changed (edge case)
          email,
          displayName: raw_user_meta_data?.displayName || null,
        },
        create: {
          id,
          email,
          displayName: raw_user_meta_data?.displayName || null,
          preferredLanguage: raw_user_meta_data?.language || 'es',
          isPremium: false,
        },
      });

      this.logger.log(`User ${user.id} synchronized successfully`);

      return {
        success: true,
        message: 'User created successfully',
        userId: user.id,
      };
    } catch (error) {
      this.logger.error(`Failed to create user ${id}:`, error);
      throw error;
    }
  }
}
