import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { QuotaService } from '../quota.service';
import { QuotaConfig } from '../interfaces/quota-config.interface';
import { QUOTA_CONFIG_KEY } from '../constants/quota.constants';

@Injectable()
export class QuotaCountingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(QuotaCountingInterceptor.name);

  constructor(
    private quotaService: QuotaService,
    private reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const quotaConfig = this.reflector.get<QuotaConfig>(
      QUOTA_CONFIG_KEY,
      context.getHandler(),
    );

    // Si no hay configuración, no hacer nada
    if (!quotaConfig) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId;
    const isPremium = request.user?.isPremium;

    // Premium users no necesitan tracking
    const skipPremium = quotaConfig.skipPremium ?? true;
    if (skipPremium && isPremium) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(async (response) => {
        // Solo incrementar si la response indica éxito en identificación
        if (this.isSuccessfulRecognition(response)) {
          try {
            await this.quotaService.incrementSuccessful(
              userId,
              quotaConfig.endpoint,
            );
            this.logger.log(
              `Quota incremented for user ${userId} on ${quotaConfig.endpoint}`,
            );
          } catch (error) {
            this.logger.error(`Failed to increment quota: ${error.message}`);
          }
        }
      }),
      catchError((error) => {
        // En caso de error, no incrementar cuota
        throw error;
      }),
    );
  }

  /**
   * Determina si la respuesta indica un reconocimiento exitoso
   * Para camera/recognize: debe contener SUCCESS_IDENTIFIED message
   */
  private isSuccessfulRecognition(response: any): boolean {
    if (!response) return false;

    // Check for SUCCESS_IDENTIFIED in message
    const successPatterns = [
      'Obra identificada',
      'Artwork identified',
      'Œuvre identifiée',
    ];

    return successPatterns.some((pattern) =>
      response.message?.includes(pattern),
    );
  }
}
