import { Body, Controller, Get, Post, Logger, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/supabase-jwt.strategy';
import type { PaymentSheetResponseDto } from './dto/payment-sheet-response.dto';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import type { SubscriptionStatusResponseDto } from './dto/subscription-status-response.dto';
import { CreateSetupIntentDto } from './dto/create-setup-intent.dto';
import type { SetupIntentResponseDto } from './dto/setup-intent-response.dto';
import { CreateSubscriptionWithPaymentMethodDto } from './dto/create-subscription-with-payment-method.dto';
import type { CancelSubscriptionResponseDto } from './dto/cancel-subscription-response.dto';
import {
  StrictThrottle,
  ModerateThrottle,
} from '../common/decorators/throttle.decorator';

@Controller('api/payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  // ============= NEW AUTHENTICATED ENDPOINTS =============

  /**
   * Create Payment Intent for Travel Pass (€4.99 one-time payment)
   * Requires authentication
   */
  @Post('create-intent')
  @StrictThrottle()
  @UseGuards(SupabaseAuthGuard)
  async createPaymentIntent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePaymentIntentDto,
  ): Promise<PaymentSheetResponseDto> {
    this.logger.log(
      `Creating payment intent for user ${user.userId}, plan: ${dto.planId}`,
    );
    return this.paymentsService.createPaymentIntent(user.userId, dto);
  }

  /**
   * Get Subscription Status for authenticated user
   * Requires authentication
   */
  @Get('subscription/status')
  @ModerateThrottle()
  @UseGuards(SupabaseAuthGuard)
  async getSubscriptionStatus(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SubscriptionStatusResponseDto> {
    this.logger.log(`Getting subscription status for user ${user.userId}`);
    return this.paymentsService.getSubscriptionStatus(user.userId);
  }

  /**
   * Create SetupIntent for subscription (Step 1 of 2-step flow)
   * This endpoint creates a SetupIntent to collect payment method without charging
   * Requires authentication
   */
  @Post('setup-intent')
  @StrictThrottle()
  @UseGuards(SupabaseAuthGuard)
  async createSetupIntent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSetupIntentDto,
  ): Promise<SetupIntentResponseDto> {
    this.logger.log(
      `Creating SetupIntent for user ${user.userId}, plan: ${dto.planId}`,
    );
    return this.paymentsService.createSetupIntent(user.userId, dto);
  }

  /**
   * Create Subscription with saved PaymentMethod (Step 2 of 2-step flow)
   * This endpoint creates a subscription using a payment method from completed SetupIntent
   * Requires authentication
   */
  @Post('create-subscription-with-payment-method')
  @StrictThrottle()
  @UseGuards(SupabaseAuthGuard)
  async createSubscriptionWithPaymentMethod(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSubscriptionWithPaymentMethodDto,
  ): Promise<{
    subscriptionId: string;
    status: string;
    currentPeriodEnd: string;
  }> {
    this.logger.log(
      `Creating subscription with payment method for user ${user.userId}, plan: ${dto.planId}`,
    );
    return this.paymentsService.createSubscriptionWithPaymentMethod(
      user.userId,
      dto,
    );
  }

  /**
   * Cancel Subscription at period end
   * User will retain premium access until the end of their current billing period
   * No refunds are issued
   * Requires authentication
   */
  @Post('subscription/cancel')
  @StrictThrottle()
  @UseGuards(SupabaseAuthGuard)
  async cancelSubscription(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CancelSubscriptionResponseDto> {
    this.logger.log(`Canceling subscription for user ${user.userId}`);
    return this.paymentsService.cancelSubscription(user.userId);
  }
}
