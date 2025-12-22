import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { WebhooksService } from './webhooks.service';
import { SupabaseWebhookGuard } from './guards/supabase-webhook.guard';
import { SupabaseWebhookDto } from './dto/supabase-webhook.dto';

@Controller('webhooks/supabase')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('user-created')
  @SkipThrottle()
  @UseGuards(SupabaseWebhookGuard)
  @HttpCode(HttpStatus.OK)
  async handleUserCreated(@Body() payload: SupabaseWebhookDto) {
    return this.webhooksService.handleUserCreated(payload);
  }
}
