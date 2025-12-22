import {
  Controller,
  Post,
  Headers,
  Req,
  BadRequestException,
  Logger,
  Inject,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import Stripe from 'stripe';
import { STRIPE_CLIENT } from './stripe/stripe.module';
import { PaymentsService } from './payments.service';

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
    @Inject('STRIPE_WEBHOOK_SECRET')
    private readonly webhookSecret: string,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Post('stripe')
  @SkipThrottle()
  async handleStripeWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() request: RawBodyRequest<Request>,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    const rawBody = request.rawBody;
    if (!rawBody) {
      throw new BadRequestException('Missing raw body');
    }

    let event: Stripe.Event;

    try {
      // Verify webhook signature
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
      );

      this.logger.log(`Received verified webhook: ${event.type}`);
    } catch (err) {
      this.logger.error(
        `Webhook signature verification failed: ${err.message}`,
      );
      throw new BadRequestException(`Webhook Error: ${err.message}`);
    }

    // Process the event
    try {
      await this.paymentsService.handleWebhookEvent(event);
      return { received: true };
    } catch (err) {
      this.logger.error(`Error processing webhook: ${err.message}`);
      throw err;
    }
  }
}
