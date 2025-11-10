import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { STRIPE_CLIENT } from './stripe/stripe.module';
import { PrismaService } from '../database/prisma.service';
import { PaymentSheetResponseDto } from './dto/payment-sheet-response.dto';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import { SubscriptionStatusResponseDto } from './dto/subscription-status-response.dto';
import { CreateSetupIntentDto } from './dto/create-setup-intent.dto';
import { SetupIntentResponseDto } from './dto/setup-intent-response.dto';
import { CreateSubscriptionWithPaymentMethodDto } from './dto/create-subscription-with-payment-method.dto';
import { PlanType, SubscriptionStatus } from '@prisma/client';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
    @Inject('STRIPE_PUBLISHABLE_KEY')
    private readonly publishableKey: string,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async getConfig() {
    return {
      publishableKey: this.publishableKey,
    };
  }

  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    this.logger.log(`Processing webhook event: ${event.type}`);

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        await this.handlePaymentSuccess(paymentIntent);
        break;
      }
      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object;
        await this.handlePaymentFailure(paymentIntent);
        break;
      }
      case 'payment_intent.canceled': {
        const paymentIntent = event.data.object;
        await this.handlePaymentCanceled(paymentIntent);
        break;
      }
      case 'customer.subscription.created':
        await this.handleSubscriptionCreated(event.data.object);
        break;
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.paid':
        await this.handleInvoicePaid(event.data.object);
        break;
      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(event.data.object);
        break;
      case 'setup_intent.succeeded': {
        const setupIntent = event.data.object;
        this.handleSetupIntentSucceeded(setupIntent);
        break;
      }
      case 'setup_intent.canceled': {
        const setupIntent = event.data.object;
        this.handleSetupIntentCanceled(setupIntent);
        break;
      }
      default:
        this.logger.log(`Unhandled event type: ${event.type}`);
    }
  }

  // ============= TRAVEL_PASS WEBHOOKS =============

  private async handlePaymentSuccess(
    paymentIntent: Stripe.PaymentIntent,
  ): Promise<void> {
    this.logger.log(
      `Payment succeeded for payment intent: ${paymentIntent.id}`,
    );
    this.logger.log(
      `Amount: ${paymentIntent.amount} ${paymentIntent.currency}`,
    );
    this.logger.log(`Customer: ${paymentIntent.customer}`);

    // TODO: Implement your business logic here:
    // - Update order status in database
    // - Send confirmation email to customer
    // - Trigger fulfillment process
    // - Update user's subscription status
    // - etc.
  }

  private async handlePaymentFailure(
    paymentIntent: Stripe.PaymentIntent,
  ): Promise<void> {
    this.logger.error(`Payment failed for payment intent: ${paymentIntent.id}`);
    this.logger.error(
      `Last payment error: ${paymentIntent.last_payment_error?.message}`,
    );

    // TODO: Implement your business logic here:
    // - Notify customer of payment failure
    // - Update order status
    // - Send retry payment link
    // - etc.
  }

  private async handlePaymentCanceled(
    paymentIntent: Stripe.PaymentIntent,
  ): Promise<void> {
    this.logger.log(`Payment canceled for payment intent: ${paymentIntent.id}`);

    // TODO: Implement your business logic here:
    // - Update order status
    // - Release reserved inventory
    // - etc.
  }

  // ============= NEW METHODS FOR AUTHENTICATED ENDPOINTS =============

  /**
   * Create Payment Intent for Travel Pass (one-time payment)
   */
  async createPaymentIntent(
    userId: string,
    dto: CreatePaymentIntentDto,
  ): Promise<PaymentSheetResponseDto> {
    this.logger.log(
      `Creating payment intent for user ${userId}, plan: ${dto.planId}`,
    );

    // Find or create customer
    const customer = await this.findOrCreateCustomer(userId);

    // Travel Pass is €4.99
    const amount = 499; // in cents

    // Create payment intent
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount,
      currency: dto.currency || 'eur',
      customer: customer.id,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        userId,
        planId: dto.planId,
      },
    });

    // Create ephemeral key
    const ephemeralKey = await this.stripe.ephemeralKeys.create(
      { customer: customer.id },
      { apiVersion: '2025-10-29.clover' },
    );

    this.logger.log(
      `Created payment intent: ${paymentIntent.id} for Travel Pass`,
    );

    return {
      paymentIntent: paymentIntent.client_secret!,
      ephemeralKey: ephemeralKey.secret!,
      customer: customer.id,
      publishableKey: this.publishableKey,
    };
  }

  /**
   * Create SetupIntent for subscription (Step 1 of 2-step flow)
   * Returns client_secret for frontend to collect payment method
   */
  async createSetupIntent(
    userId: string,
    dto: CreateSetupIntentDto,
  ): Promise<SetupIntentResponseDto> {
    this.logger.log(
      `Creating SetupIntent for user ${userId}, plan: ${dto.planId}`,
    );

    // 1. Find or create customer
    const customer = await this.findOrCreateCustomer(userId);

    // 2. Create SetupIntent with off_session usage for future payments
    const setupIntent = await this.stripe.setupIntents.create({
      customer: customer.id,
      usage: 'off_session', // Critical for future off-session payments
      payment_method_types: ['card'],
      metadata: {
        userId,
        planId: dto.planId,
      },
    });

    // 3. Create ephemeral key for customer access
    const ephemeralKey = await this.stripe.ephemeralKeys.create(
      { customer: customer.id },
      { apiVersion: '2025-10-29.clover' },
    );

    this.logger.log(`Created SetupIntent: ${setupIntent.id} for ${dto.planId}`);

    return {
      setupIntent: setupIntent.client_secret!,
      ephemeralKey: ephemeralKey.secret!,
      customer: customer.id,
      publishableKey: this.publishableKey,
    };
  }

  /**
   * Create Subscription with saved PaymentMethod (Step 2 of 2-step flow)
   * Uses PaymentMethod from completed SetupIntent
   */
  async createSubscriptionWithPaymentMethod(
    userId: string,
    dto: CreateSubscriptionWithPaymentMethodDto,
  ): Promise<{
    subscriptionId: string;
    status: string;
    currentPeriodEnd: string;
  }> {
    this.logger.log(
      `Creating subscription with payment method for user ${userId}, plan: ${dto.planId}`,
    );

    // 1. Check if user already has active subscription of this plan
    const existing = await this.prisma.subscription.findFirst({
      where: {
        userId,
        planId: dto.planId as PlanType,
        status: 'active',
        currentPeriodEnd: { gt: new Date() },
      },
    });

    if (existing) {
      throw new BadRequestException(
        'Ya tienes una suscripción activa de este plan',
      );
    }

    // 2. Get or create customer
    const customer = await this.findOrCreateCustomer(userId);

    // 3. Determine payment method to use
    let paymentMethodId: string;

    // Priority 1: If setupIntentId is provided, retrieve payment method from SetupIntent
    if (dto.setupIntentId) {
      this.logger.log(
        `Retrieving payment method from SetupIntent: ${dto.setupIntentId}`,
      );

      const setupIntent = (await this.stripe.setupIntents.retrieve(
        dto.setupIntentId,
      )) as Stripe.SetupIntent;

      if (setupIntent.status !== 'succeeded') {
        throw new BadRequestException(
          `SetupIntent no completado. Estado: ${setupIntent.status}`,
        );
      }

      if (!setupIntent.payment_method) {
        throw new BadRequestException(
          'El SetupIntent no tiene un método de pago asociado',
        );
      }

      paymentMethodId =
        typeof setupIntent.payment_method === 'string'
          ? setupIntent.payment_method
          : setupIntent.payment_method.id;

      this.logger.log(
        `Extracted payment method ${paymentMethodId} from SetupIntent ${dto.setupIntentId}`,
      );
    }
    // Priority 2: If setupIntentId not provided, try to get customer's default or first attached
    else {
      this.logger.log(
        `No setupIntentId provided, retrieving payment method for customer ${customer.id}`,
      );

      const customerDetails = (await this.stripe.customers.retrieve(
        customer.id,
      )) as Stripe.Customer;

      const defaultPaymentMethod =
        customerDetails.invoice_settings?.default_payment_method;

      if (defaultPaymentMethod) {
        // Use customer's default payment method
        paymentMethodId =
          typeof defaultPaymentMethod === 'string'
            ? defaultPaymentMethod
            : defaultPaymentMethod.id;

        this.logger.log(
          `Using default payment method: ${paymentMethodId} for customer ${customer.id}`,
        );
      } else {
        // Fallback: Get the first attached payment method
        this.logger.log(
          `No default payment method found, searching for attached payment methods...`,
        );

        const paymentMethods = await this.stripe.paymentMethods.list({
          customer: customer.id,
          type: 'card',
          limit: 1,
        });

        if (paymentMethods.data.length === 0) {
          throw new BadRequestException(
            'No se encontró ningún método de pago para este cliente. Por favor, completa el proceso de pago primero.',
          );
        }

        paymentMethodId = paymentMethods.data[0].id;
        this.logger.log(
          `Using first attached payment method: ${paymentMethodId}`,
        );
      }
    }

    // 4. Verify payment method belongs to customer
    const paymentMethod =
      await this.stripe.paymentMethods.retrieve(paymentMethodId);

    if (paymentMethod.customer !== customer.id) {
      this.logger.error(
        `Payment method ${paymentMethodId} does not belong to customer ${customer.id}`,
      );
      throw new BadRequestException(
        'El método de pago no pertenece a este cliente',
      );
    }

    // 5. Map planId to Stripe Price ID
    const priceId = this.getPriceId(dto.planId);

    // 6. Create Subscription with saved payment method
    const subscription: Stripe.Subscription =
      await this.stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: priceId }],
        default_payment_method: paymentMethodId,
        metadata: { userId, planId: dto.planId },
      });

    this.logger.log(
      `Subscription created: ${subscription.id}, status: ${subscription.status}`,
    );

    // 7. Extract billing period from first subscription item
    const subscriptionItem = subscription.items.data[0];
    const currentPeriodStart = new Date(
      subscriptionItem.current_period_start * 1000,
    );
    const currentPeriodEnd = new Date(
      subscriptionItem.current_period_end * 1000,
    );

    // Log subscription details for debugging
    this.logger.log(
      `Subscription period: start=${currentPeriodStart.toISOString()}, end=${currentPeriodEnd.toISOString()}`,
    );

    await this.prisma.subscription.upsert({
      where: {
        userId_planId: { userId, planId: dto.planId as PlanType },
      },
      create: {
        userId,
        stripeCustomerId: customer.id,
        stripeSubscriptionId: subscription.id,
        planId: dto.planId as PlanType,
        status: subscription.status as SubscriptionStatus,
        currentPeriodStart,
        currentPeriodEnd,
      },
      update: {
        stripeCustomerId: customer.id,
        stripeSubscriptionId: subscription.id,
        status: subscription.status as SubscriptionStatus,
        currentPeriodStart,
        currentPeriodEnd,
      },
    });

    return {
      subscriptionId: subscription.id,
      status: subscription.status,
      currentPeriodEnd: currentPeriodEnd?.toISOString() || '',
    };
  }

  /**
   * Get Subscription Status for a user
   */
  async getSubscriptionStatus(
    userId: string,
  ): Promise<SubscriptionStatusResponseDto> {
    // Find most recent active subscription
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        userId,
        OR: [{ status: 'active' }, { status: 'past_due' }],
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!subscription) {
      return {
        plan: null,
        status: 'none',
        isSubscribed: false,
      };
    }

    // Check if expired
    const now = new Date();
    const isExpired =
      subscription.currentPeriodEnd && subscription.currentPeriodEnd < now;

    if (isExpired) {
      // Update status in DB
      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'expired' },
      });

      return {
        plan: subscription.planId,
        status: 'expired',
        expiryDate: subscription.currentPeriodEnd?.toISOString(),
        isSubscribed: false,
      };
    }

    return {
      plan: subscription.planId,
      status: subscription.status as 'active' | 'canceled' | 'past_due',
      expiryDate: subscription.currentPeriodEnd?.toISOString(),
      isSubscribed: subscription.status === 'active',
    };
  }

  // ============= HELPER METHODS =============

  /**
   * Find or create Stripe customer
   */
  private async findOrCreateCustomer(userId: string): Promise<Stripe.Customer> {
    // Check if customer exists in DB
    const subscription = await this.prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (subscription?.stripeCustomerId) {
      // Verify customer exists in Stripe
      try {
        const customer = await this.stripe.customers.retrieve(
          subscription.stripeCustomerId,
        );
        if (!customer.deleted) {
          this.logger.log(`Using existing customer: ${customer.id}`);
          return customer as Stripe.Customer;
        }
      } catch {
        this.logger.warn(
          `Customer ${subscription.stripeCustomerId} not found in Stripe, creating new`,
        );
      }
    }

    // Create new customer
    const customer = await this.stripe.customers.create({
      metadata: { userId },
    });

    this.logger.log(`Created new customer: ${customer.id} for user ${userId}`);
    return customer;
  }

  /**
   * Map planId to Stripe Price ID
   */
  private getPriceId(planId: 'monthly' | 'annual'): string {
    const priceIds = {
      monthly: this.configService.get<string>('STRIPE_PRICE_MONTHLY'),
      annual: this.configService.get<string>('STRIPE_PRICE_ANNUAL'),
    };

    const priceId = priceIds[planId];

    if (!priceId) {
      throw new BadRequestException(
        `Price ID not configured for plan: ${planId}`,
      );
    }

    return priceId;
  }

  // ============= ENHANCED WEBHOOK HANDLERS =============

  /**
   * Handle subscription created webhook
   */
  private async handleSubscriptionCreated(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const userId = subscription.metadata?.userId;
    const planId = subscription.metadata?.planId as PlanType;

    if (!userId || !planId) {
      this.logger.warn(`Missing metadata in subscription ${subscription.id}`);
      return;
    }

    // Extract billing period from first subscription item
    const subscriptionItem = subscription.items.data[0];
    const currentPeriodStart = new Date(
      subscriptionItem.current_period_start * 1000,
    );
    const currentPeriodEnd = new Date(
      subscriptionItem.current_period_end * 1000,
    );

    await this.prisma.subscription.upsert({
      where: {
        userId_planId: { userId, planId },
      },
      create: {
        userId,
        stripeCustomerId: subscription.customer as string,
        stripeSubscriptionId: subscription.id,
        planId,
        status: subscription.status as SubscriptionStatus,
        currentPeriodStart,
        currentPeriodEnd,
      },
      update: {
        stripeSubscriptionId: subscription.id,
        status: subscription.status as SubscriptionStatus,
        currentPeriodStart,
        currentPeriodEnd,
      },
    });

    this.logger.log(
      `Subscription created/updated for user ${userId}, plan ${planId}`,
    );
  }

  /**
   * Handle subscription updated webhook
   */
  private async handleSubscriptionUpdated(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    // Extract billing period from first subscription item
    const subscriptionItem = subscription.items.data[0];
    const currentPeriodStart = new Date(
      subscriptionItem.current_period_start * 1000,
    );
    const currentPeriodEnd = new Date(
      subscriptionItem.current_period_end * 1000,
    );

    await this.prisma.subscription.update({
      where: { stripeSubscriptionId: subscription.id },
      data: {
        status: subscription.status as SubscriptionStatus,
        currentPeriodStart,
        currentPeriodEnd,
      },
    });

    this.logger.log(
      `Subscription ${subscription.id} updated to status ${subscription.status}`,
    );
  }

  /**
   * Handle subscription deleted webhook
   */
  private async handleSubscriptionDeleted(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    await this.prisma.subscription.update({
      where: { stripeSubscriptionId: subscription.id },
      data: {
        status: 'canceled',
      },
    });

    this.logger.log(`Subscription ${subscription.id} canceled`);
  }

  /**
   * Handle invoice paid webhook
   */
  private async handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    const customerId =
      typeof invoice.customer === 'string'
        ? invoice.customer
        : invoice.customer?.id;

    if (!customerId) return; // Not a customer invoice

    // Find subscription by customer ID
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        stripeCustomerId: customerId,
        status: { in: ['active', 'past_due', 'incomplete'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      this.logger.warn(
        `No active subscription found for customer ${customerId}`,
      );
      return;
    }

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'active',
        currentPeriodStart: new Date(invoice.period_start * 1000),
        currentPeriodEnd: new Date(invoice.period_end * 1000),
      },
    });

    this.logger.log(
      `Invoice ${invoice.id} paid, subscription ${subscription.id} renewed`,
    );
  }

  /**
   * Handle invoice payment failed webhook
   */
  private async handleInvoicePaymentFailed(
    invoice: Stripe.Invoice,
  ): Promise<void> {
    const customerId =
      typeof invoice.customer === 'string'
        ? invoice.customer
        : invoice.customer?.id;

    if (!customerId) return;

    // Find subscription by customer ID
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        stripeCustomerId: customerId,
        status: { in: ['active', 'past_due', 'incomplete'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      this.logger.warn(
        `No active subscription found for customer ${customerId}`,
      );
      return;
    }

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'past_due',
      },
    });

    this.logger.error(
      `Invoice ${invoice.id} payment failed, subscription ${subscription.id} past due`,
    );
    // TODO: Send email to user
  }

  /**
   * Handle SetupIntent succeeded webhook
   */
  private handleSetupIntentSucceeded(setupIntent: Stripe.SetupIntent): void {
    this.logger.log(`SetupIntent succeeded: ${setupIntent.id}`);

    const paymentMethodId = setupIntent.payment_method as string;
    const customerId = setupIntent.customer as string;
    const userId = setupIntent.metadata?.userId;
    const planId = setupIntent.metadata?.planId;

    this.logger.log(
      `Payment method ${paymentMethodId} saved for customer ${customerId}, user ${userId}, plan ${planId}`,
    );

    // Optional: Auto-create subscription here if desired
    // For now, we just log the success - frontend will call createSubscriptionWithPaymentMethod
  }

  /**
   * Handle SetupIntent canceled webhook
   */
  private handleSetupIntentCanceled(setupIntent: Stripe.SetupIntent): void {
    this.logger.log(`SetupIntent canceled: ${setupIntent.id}`);

    const userId = setupIntent.metadata?.userId;
    const planId = setupIntent.metadata?.planId;

    this.logger.log(
      `User ${userId} canceled payment method setup for plan ${planId}`,
    );

    // Optional: Clean up any pending records or notify user
  }
}
