import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cron job that runs twice daily (9:00 AM and 9:00 PM UTC)
   * to expire travel_pass purchases that have passed their valid_until date.
   */
  @Cron('0 9,21 * * *', {
    name: 'expire-travel-pass',
    timeZone: 'UTC',
  })
  async expireTravelPasses(): Promise<void> {
    this.logger.log(
      'Cron job started: Checking for expired travel_pass purchases',
    );

    try {
      const now = new Date();

      // Find all active travel_pass purchases that have expired
      const expiredPurchases = await this.prisma.oneTimePurchase.findMany({
        where: {
          productType: 'travel_pass',
          status: 'succeeded',
          validUntil: {
            lt: now,
          },
        },
        select: {
          id: true,
          userId: true,
          validUntil: true,
        },
      });

      if (expiredPurchases.length === 0) {
        this.logger.log('No expired travel_pass purchases found');
        return;
      }

      this.logger.log(
        `Found ${expiredPurchases.length} expired travel_pass purchase(s)`,
      );

      // Get unique user IDs from expired purchases
      const userIds: string[] = [
        ...new Set(expiredPurchases.map((p) => p.userId)),
      ];

      // Update all expired purchases status (mark as expired by changing status)
      // Note: PurchaseStatus doesn't have 'expired', so we keep 'succeeded' but rely on validUntil
      // The purchase is still "succeeded" but no longer valid

      // Update user premium status for affected users
      // Check if they have any other active premium (subscription or valid purchase)
      for (const userId of userIds) {
        // Check if user has any active subscription
        const activeSubscription = await this.prisma.subscription.findFirst({
          where: {
            userId,
            status: 'active',
            currentPeriodEnd: { gt: now },
          },
        });

        // Check if user has any other valid purchase
        const validPurchase = await this.prisma.oneTimePurchase.findFirst({
          where: {
            userId,
            status: 'succeeded',
            validUntil: { gt: now },
          },
        });

        // If no active subscription or valid purchase, set isPremium to false
        if (!activeSubscription && !validPurchase) {
          await this.prisma.user.update({
            where: { id: userId },
            data: { isPremium: false },
          });

          this.logger.log(`User ${userId} premium status set to false`);
        }
      }

      this.logger.log(
        `Successfully processed ${expiredPurchases.length} expired travel_pass purchase(s)`,
      );

      // Log details for each expired purchase (useful for debugging)
      expiredPurchases.forEach((purchase) => {
        this.logger.debug(
          `Expired purchase: userId=${purchase.userId}, id=${purchase.id}, expiredOn=${purchase.validUntil?.toISOString()}`,
        );
      });
    } catch (error) {
      this.logger.error(
        'Error while processing expired travel_pass purchases',
        error instanceof Error ? error.stack : error,
      );
    }

    this.logger.log('Cron job completed: Expire travel_pass purchases');
  }
}
