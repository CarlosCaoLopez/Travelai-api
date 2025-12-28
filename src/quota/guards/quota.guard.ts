import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { QuotaService } from '../quota.service';
import { QuotaConfig } from '../interfaces/quota-config.interface';
import { QUOTA_CONFIG_KEY } from '../constants/quota.constants';
import { getQuotaExceededMessage } from '../constants/quota-messages';

@Injectable()
export class QuotaGuard implements CanActivate {
  private readonly logger = new Logger(QuotaGuard.name);

  constructor(
    private quotaService: QuotaService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Obtener configuración de cuota del decorator
    const quotaConfig = this.reflector.get<QuotaConfig>(
      QUOTA_CONFIG_KEY,
      context.getHandler(),
    );

    // Si no hay configuración, permitir request
    if (!quotaConfig) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // User debe estar autenticado
    if (!user?.userId) {
      throw new UnauthorizedException();
    }

    const { userId, isPremium } = user;
    const skipPremium = quotaConfig.skipPremium ?? true;

    // Verificar cuota
    const result = await this.quotaService.checkQuota(
      userId,
      quotaConfig.endpoint,
      skipPremium && isPremium,
    );

    if (!result.allowed) {
      this.logger.warn(
        `Quota exceeded for user ${userId} on endpoint ${quotaConfig.endpoint}. ` +
          `Usage day: ${result.info.currentUsageDay}, Used: ${result.info.usedToday}/${result.info.dailyLimit}`,
      );

      // Obtener idioma preferido del usuario
      const language = request.user?.preferredLanguage || 'es';

      throw new ForbiddenException({
        statusCode: 403,
        error: 'QuotaExceeded',
        message: getQuotaExceededMessage(language),
        quotaInfo: result.info,
      });
    }

    // Adjuntar info de cuota al request para uso posterior (opcional)
    request.quotaInfo = result.info;

    return true;
  }
}
