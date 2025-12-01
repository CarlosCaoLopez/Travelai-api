import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SupabaseWebhookGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const webhookSecret = request.headers['x-webhook-secret'];

    const expectedSecret = this.configService.get<string>(
      'SUPABASE_WEBHOOK_SECRET',
    );

    if (!webhookSecret) {
      throw new UnauthorizedException('Missing webhook secret');
    }

    if (!expectedSecret) {
      throw new UnauthorizedException(
        'Webhook secret not configured on server',
      );
    }

    if (webhookSecret !== expectedSecret) {
      throw new UnauthorizedException('Invalid webhook secret');
    }

    return true;
  }
}
