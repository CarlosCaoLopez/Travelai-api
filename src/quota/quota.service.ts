import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  QuotaInfo,
  QuotaCheckResult,
} from './interfaces/quota-config.interface';
import { format, addDays, differenceInDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const MADRID_TIMEZONE = 'Europe/Madrid';

@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Determina el límite diario según el día de uso
   * Día 0 (primer día): 5
   * Día 1 (segundo día): 2
   * Día 2 (tercer día): 2
   * Día 3+ (cuarto día en adelante): 1
   */
  private getQuotaLimit(usageDay: number): number {
    if (usageDay === 0) return 5;
    if (usageDay === 1 || usageDay === 2) return 2;
    return 1; // Day 3 onwards
  }

  /**
   * Obtiene la fecha actual en timezone de Madrid (formato YYYY-MM-DD)
   */
  private getMadridDate(): string {
    const madridTime = toZonedTime(new Date(), MADRID_TIMEZONE);
    return format(madridTime, 'yyyy-MM-dd');
  }

  /**
   * Calcula el timestamp de reset (mañana a las 00:00 Madrid time)
   */
  private getNextDayReset(): Date {
    const madridTime = toZonedTime(new Date(), MADRID_TIMEZONE);
    const tomorrow = addDays(madridTime, 1);
    const tomorrowStart = new Date(tomorrow.setHours(0, 0, 0, 0));
    return tomorrowStart;
  }

  /**
   * Verifica si un usuario tiene cuota disponible
   */
  async checkQuota(
    userId: string,
    endpoint: string,
    isPremium = false,
  ): Promise<QuotaCheckResult> {
    // Premium users bypass quota
    if (isPremium) {
      return {
        allowed: true,
        info: {
          hasQuota: true,
          currentUsageDay: 0,
          dailyLimit: Infinity,
          usedToday: 0,
          remainingToday: Infinity,
          resetsAt: null,
          cycleResetsAt: null,
          isPremium: true,
        },
      };
    }

    const today = this.getMadridDate();

    // Obtener o crear registro de cuota
    let quota = await this.prisma.userQuotaUsage.findUnique({
      where: { userId_endpoint: { userId, endpoint } },
    });

    const now = new Date();

    // Primera vez que usa este endpoint
    if (!quota) {
      quota = await this.prisma.userQuotaUsage.create({
        data: {
          userId,
          endpoint,
          firstUsedAt: now,
          lastResetAt: now,
          usageDays: 0,
          successfulToday: 0,
          lastUsageDate: today,
        },
      });
    } else {
      // Verificar si han pasado 30 días desde el primer uso
      const daysSinceFirstUse = differenceInDays(now, quota.firstUsedAt);

      if (daysSinceFirstUse >= 30) {
        // Reset completo del ciclo
        this.logger.log(
          `Resetting 30-day cycle for user ${userId} on endpoint ${endpoint}`,
        );

        quota = await this.prisma.userQuotaUsage.update({
          where: { id: quota.id },
          data: {
            firstUsedAt: now,
            lastResetAt: now,
            usageDays: 0,
            successfulToday: 0,
            lastUsageDate: today,
          },
        });
      } else if (quota.lastUsageDate !== today) {
        // Nuevo día calendario -> incrementar usageDays y resetear contador diario
        this.logger.log(
          `New usage day for user ${userId} on endpoint ${endpoint}: ${quota.usageDays} -> ${quota.usageDays + 1}`,
        );

        quota = await this.prisma.userQuotaUsage.update({
          where: { id: quota.id },
          data: {
            usageDays: quota.usageDays + 1,
            successfulToday: 0,
            lastUsageDate: today,
          },
        });
      }
    }

    // Calcular límite para el día de uso actual
    const dailyLimit = this.getQuotaLimit(quota.usageDays);
    const remaining = Math.max(0, dailyLimit - quota.successfulToday);
    const allowed = remaining > 0;

    const info: QuotaInfo = {
      hasQuota: allowed,
      currentUsageDay: quota.usageDays,
      dailyLimit,
      usedToday: quota.successfulToday,
      remainingToday: remaining,
      resetsAt: this.getNextDayReset().toISOString(),
      cycleResetsAt: addDays(quota.firstUsedAt, 30).toISOString(),
      isPremium: false,
    };

    return { allowed, info };
  }

  /**
   * Incrementa el contador de requests exitosas
   */
  async incrementSuccessful(userId: string, endpoint: string): Promise<void> {
    const today = this.getMadridDate();

    await this.prisma.userQuotaUsage.upsert({
      where: { userId_endpoint: { userId, endpoint } },
      update: {
        successfulToday: { increment: 1 },
        lastUsageDate: today,
      },
      create: {
        userId,
        endpoint,
        firstUsedAt: new Date(),
        lastResetAt: new Date(),
        usageDays: 0,
        successfulToday: 1,
        lastUsageDate: today,
      },
    });

    this.logger.log(
      `Incremented successful usage for user ${userId} on endpoint ${endpoint}`,
    );
  }

  /**
   * Obtiene información de cuota (para debugging/admin)
   */
  async getQuotaInfo(
    userId: string,
    endpoint: string,
    isPremium = false,
  ): Promise<QuotaInfo> {
    const result = await this.checkQuota(userId, endpoint, isPremium);
    return result.info;
  }
}
