import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
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
import { CancelSubscriptionResponseDto } from './dto/cancel-subscription-response.dto';
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

  // ============= TRAVEL_PASS WEBHOOKS (One-Time Purchases) =============

  private async handlePaymentSuccess(
    paymentIntent: Stripe.PaymentIntent,
  ): Promise<void> {
    this.logger.log(
      `Payment succeeded for payment intent: ${paymentIntent.id}`,
    );

    // Extract metadata
    const userId = paymentIntent.metadata?.userId;
    const planId = paymentIntent.metadata?.planId;

    if (!userId || !planId) {
      this.logger.warn(
        `Payment intent ${paymentIntent.id} missing metadata (userId or planId)`,
      );
      return;
    }

    // Verify it's a travel_pass payment
    if (planId !== 'travel_pass') {
      this.logger.warn(
        `Payment intent ${paymentIntent.id} is not for travel_pass, ignoring`,
      );
      return;
    }

    // IDEMPOTENCY CHECK: Check if already processed
    const existingPurchase = await this.prisma.oneTimePurchase.findUnique({
      where: { id: paymentIntent.id },
    });

    if (existingPurchase) {
      this.logger.log(
        `Payment intent ${paymentIntent.id} already processed, ignoring duplicate webhook`,
      );
      return;
    }

    // Calculate 7-day validity period
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 7);

    // Create one-time purchase record for Travel Pass
    await this.prisma.oneTimePurchase.create({
      data: {
        id: paymentIntent.id,
        userId,
        productType: 'travel_pass',
        amount: 499, // €4.99 in cents
        currency: 'eur',
        status: 'succeeded',
        validUntil,
      },
    });

    // Update user premium status
    await this.prisma.user.update({
      where: { id: userId },
      data: { isPremium: true },
    });

    this.logger.log(
      `Travel Pass activated for user ${userId}, valid until ${validUntil.toISOString()}`,
    );
  }

  private async handlePaymentFailure(
    paymentIntent: Stripe.PaymentIntent,
  ): Promise<void> {
    this.logger.error(`Payment failed for payment intent: ${paymentIntent.id}`);
    this.logger.error(
      `Last payment error: ${paymentIntent.last_payment_error?.message}`,
    );

    // Find purchase by payment intent ID
    const purchase = await this.prisma.oneTimePurchase.findUnique({
      where: { id: paymentIntent.id },
    });

    if (purchase) {
      // Update status to failed
      await this.prisma.oneTimePurchase.update({
        where: { id: purchase.id },
        data: { status: 'failed' },
      });

      this.logger.log(
        `Purchase ${purchase.id} marked as failed due to payment failure`,
      );
    } else {
      this.logger.warn(
        `No purchase found for failed payment intent ${paymentIntent.id}`,
      );
    }
  }

  private async handlePaymentCanceled(
    paymentIntent: Stripe.PaymentIntent,
  ): Promise<void> {
    this.logger.log(`Payment canceled for payment intent: ${paymentIntent.id}`);

    // Find purchase by payment intent ID
    const purchase = await this.prisma.oneTimePurchase.findUnique({
      where: { id: paymentIntent.id },
    });

    if (purchase) {
      // Update status to failed (canceled payments are essentially failed)
      await this.prisma.oneTimePurchase.update({
        where: { id: purchase.id },
        data: { status: 'failed' },
      });

      this.logger.log(`Purchase ${purchase.id} marked as failed (canceled)`);
    } else {
      this.logger.warn(
        `No purchase found for canceled payment intent ${paymentIntent.id}`,
      );
    }
  }

  // ============= AUTHENTICATED ENDPOINTS =============

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

    // Check for existing active purchase or subscription
    const hasActivePremium = await this.checkActivePremium(userId);

    if (hasActivePremium) {
      throw new BadRequestException(
        `Ya tienes una suscripción o pase activo. ` +
          `Solo puedes tener una suscripción activa a la vez.`,
      );
    }

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
   */
  async createSetupIntent(
    userId: string,
    dto: CreateSetupIntentDto,
  ): Promise<SetupIntentResponseDto> {
    this.logger.log(
      `Creating SetupIntent for user ${userId}, plan: ${dto.planId}`,
    );

    // Check for existing active purchase or subscription
    const hasActivePremium = await this.checkActivePremium(userId);

    if (hasActivePremium) {
      throw new BadRequestException(
        `Ya tienes una suscripción o pase activo. ` +
          `Solo puedes tener una suscripción activa a la vez.`,
      );
    }

    // Find or create customer
    const customer = await this.findOrCreateCustomer(userId);

    // Create SetupIntent
    const setupIntent = await this.stripe.setupIntents.create({
      customer: customer.id,
      usage: 'off_session',
      payment_method_types: ['card'],
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

    // Check if user already has active subscription
    const existingSubscription = await this.prisma.subscription.findFirst({
      where: {
        userId,
        status: 'active',
        currentPeriodEnd: { gt: new Date() },
      },
    });

    if (existingSubscription) {
      throw new BadRequestException('Ya tienes una suscripción activa');
    }

    // Get or create customer
    const customer = await this.findOrCreateCustomer(userId);

    // Determine payment method to use
    let paymentMethodId: string;

    if (dto.setupIntentId) {
      const setupIntent = await this.stripe.setupIntents.retrieve(
        dto.setupIntentId,
      );

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
    } else {
      // Get customer's default or first attached payment method
      const customerDetails = (await this.stripe.customers.retrieve(
        customer.id,
      )) as Stripe.Customer;

      const defaultPaymentMethod =
        customerDetails.invoice_settings?.default_payment_method;

      if (defaultPaymentMethod) {
        paymentMethodId =
          typeof defaultPaymentMethod === 'string'
            ? defaultPaymentMethod
            : defaultPaymentMethod.id;
      } else {
        const paymentMethods = await this.stripe.paymentMethods.list({
          customer: customer.id,
          type: 'card',
          limit: 1,
        });

        if (paymentMethods.data.length === 0) {
          throw new BadRequestException(
            'No se encontró ningún método de pago para este cliente.',
          );
        }

        paymentMethodId = paymentMethods.data[0].id;
      }
    }

    // Verify payment method belongs to customer
    const paymentMethod =
      await this.stripe.paymentMethods.retrieve(paymentMethodId);

    if (paymentMethod.customer !== customer.id) {
      throw new BadRequestException(
        'El método de pago no pertenece a este cliente',
      );
    }

    // Map planId to Stripe Price ID
    const priceId = this.getPriceId(dto.planId);

    // Create Subscription
    const subscription = await this.stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      default_payment_method: paymentMethodId,
      metadata: { userId, planId: dto.planId },
    });

    this.logger.log(
      `Subscription created: ${subscription.id}, status: ${subscription.status}`,
    );

    // Extract billing period
    const subscriptionItem = subscription.items.data[0];
    const currentPeriodEnd = new Date(
      subscriptionItem.current_period_end * 1000,
    );

    // Create subscription record (use Stripe Subscription ID as PK)
    await this.prisma.subscription.upsert({
      where: { id: subscription.id },
      update: {
        status: subscription.status as SubscriptionStatus,
        currentPeriodEnd,
      },
      create: {
        id: subscription.id,
        userId,
        planId: dto.planId as PlanType,
        status: subscription.status as SubscriptionStatus,
        currentPeriodEnd,
      },
    });

    // Update user premium status
    if (subscription.status === 'active') {
      await this.prisma.user.update({
        where: { id: userId },
        data: { isPremium: true },
      });
    }

    return {
      subscriptionId: subscription.id,
      status: subscription.status,
      currentPeriodEnd: currentPeriodEnd.toISOString(),
    };
  }

  /**
   * Get Subscription Status for a user
   */
  async getSubscriptionStatus(
    userId: string,
  ): Promise<SubscriptionStatusResponseDto> {
    const now = new Date();

    // 1. Check active one-time purchase (travel_pass)
    const purchase = await this.prisma.oneTimePurchase.findFirst({
      where: {
        userId,
        status: 'succeeded',
        validUntil: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (purchase) {
      return {
        plan: null, // One-time purchases are not subscription plans
        status: 'active',
        expiryDate: purchase.validUntil?.toISOString(),
        isSubscribed: true,
      };
    }

    // 2. Check active subscription
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        userId,
        OR: [{ status: 'active' }, { status: 'past_due' }],
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      return {
        plan: null,
        status: 'none',
        isSubscribed: false,
      };
    }

    // Check if subscription expired
    const isExpired = subscription.currentPeriodEnd < now;

    if (isExpired) {
      // Update status in DB
      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'expired' },
      });

      // Update user premium status
      await this.prisma.user.update({
        where: { id: userId },
        data: { isPremium: false },
      });

      return {
        plan: subscription.planId,
        status: 'expired',
        expiryDate: subscription.currentPeriodEnd.toISOString(),
        isSubscribed: false,
      };
    }

    return {
      plan: subscription.planId,
      status: subscription.status as 'active' | 'canceled' | 'past_due',
      expiryDate: subscription.currentPeriodEnd.toISOString(),
      isSubscribed: subscription.status === 'active',
    };
  }

  async cancelSubscription(
    userId: string,
  ): Promise<CancelSubscriptionResponseDto> {
    this.logger.log(`Canceling subscription for user ${userId}`);

    // Find user's active subscription
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        userId,
        OR: [{ status: 'active' }, { status: 'past_due' }],
      },
      orderBy: { createdAt: 'desc' },
    });

    // Check if user has a subscription
    if (!subscription) {
      // Check if user only has travel pass
      const purchase = await this.prisma.oneTimePurchase.findFirst({
        where: {
          userId,
          status: 'succeeded',
          validUntil: { gt: new Date() },
        },
      });

      if (purchase) {
        throw new BadRequestException(
          'No tienes una suscripción activa. Los Travel Pass no pueden ser cancelados.',
        );
      }

      throw new NotFoundException('No tienes una suscripción activa');
    }

    // Check if already canceled
    if (subscription.status === 'canceled') {
      throw new BadRequestException('La suscripción ya está cancelada');
    }

    try {
      // Cancel subscription at period end in Stripe
      const updatedSubscription = await this.stripe.subscriptions.update(
        subscription.id,
        {
          cancel_at_period_end: true,
        },
      );

      this.logger.log(
        `Subscription ${subscription.id} marked for cancellation at period end`,
      );

      // Return cancellation details
      return {
        success: true,
        subscription: {
          id: subscription.id,
          status: subscription.status,
          cancelAtPeriodEnd: updatedSubscription.cancel_at_period_end,
          currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
          planId: subscription.planId,
        },
        message: `Tu suscripción será cancelada el ${subscription.currentPeriodEnd.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}. Seguirás teniendo acceso premium hasta esa fecha.`,
      };
    } catch (error) {
      this.logger.error(
        `Failed to cancel subscription ${subscription.id}:`,
        error,
      );
      throw new BadRequestException(
        'Error al cancelar la suscripción. Por favor, intenta nuevamente.',
      );
    }
  }

  // ============= HELPER METHODS =============

  /**
   * Check if user has any active premium (purchase or subscription)
   */
  private async checkActivePremium(userId: string): Promise<boolean> {
    const now = new Date();

    // Check active one-time purchase
    const activePurchase = await this.prisma.oneTimePurchase.findFirst({
      where: {
        userId,
        status: 'succeeded',
        validUntil: { gt: now },
      },
    });

    if (activePurchase) return true;

    // Check active subscription
    const activeSubscription = await this.prisma.subscription.findFirst({
      where: {
        userId,
        status: 'active',
        currentPeriodEnd: { gt: now },
      },
    });

    return !!activeSubscription;
  }

  /**
   * Find or create Stripe customer (uses users table)
   */
  private async findOrCreateCustomer(userId: string): Promise<Stripe.Customer> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (user?.stripeCustomerId) {
      try {
        const customer = await this.stripe.customers.retrieve(
          user.stripeCustomerId,
        );
        if (!customer.deleted) {
          return customer as Stripe.Customer;
        }
      } catch {
        this.logger.warn(
          `Customer ${user.stripeCustomerId} not found in Stripe, creating new`,
        );
      }
    }

    // Create new customer
    const customer = await this.stripe.customers.create({
      metadata: { userId },
      email: user?.email,
    });

    // Store customer ID in users table
    if (user) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { stripeCustomerId: customer.id },
      });
    }

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

  // ============= SUBSCRIPTION WEBHOOK HANDLERS =============

  private async handleSubscriptionCreated(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const userId = subscription.metadata?.userId;
    const planId = subscription.metadata?.planId as PlanType;

    if (!userId || !planId) {
      this.logger.warn(`Missing metadata in subscription ${subscription.id}`);
      return;
    }

    const subscriptionItem = subscription.items.data[0];
    const currentPeriodEnd = new Date(
      subscriptionItem.current_period_end * 1000,
    );

    // Upsert subscription record
    await this.prisma.subscription.upsert({
      where: { id: subscription.id },
      update: {
        status: subscription.status as SubscriptionStatus,
        currentPeriodEnd,
      },
      create: {
        id: subscription.id,
        userId,
        planId,
        status: subscription.status as SubscriptionStatus,
        currentPeriodEnd,
      },
    });

    // Update user premium status
    if (subscription.status === 'active') {
      await this.prisma.user.update({
        where: { id: userId },
        data: { isPremium: true },
      });
    }

    this.logger.log(`Subscription created for user ${userId}, plan ${planId}`);
  }

  private async handleSubscriptionUpdated(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const existingSubscription = await this.prisma.subscription.findUnique({
      where: { id: subscription.id },
    });

    if (!existingSubscription) {
      this.logger.warn(`Subscription ${subscription.id} not found in database`);
      return;
    }

    const subscriptionItem = subscription.items.data[0];
    const currentPeriodEnd = new Date(
      subscriptionItem.current_period_end * 1000,
    );

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: subscription.status as SubscriptionStatus,
        currentPeriodEnd,
      },
    });

    // Update user premium status
    const isPremium = subscription.status === 'active';
    await this.prisma.user.update({
      where: { id: existingSubscription.userId },
      data: { isPremium },
    });

    this.logger.log(
      `Subscription ${subscription.id} updated to status ${subscription.status}`,
    );
  }

  private async handleSubscriptionDeleted(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const existingSubscription = await this.prisma.subscription.findUnique({
      where: { id: subscription.id },
    });

    if (!existingSubscription) {
      this.logger.warn(`Subscription ${subscription.id} not found in database`);
      return;
    }

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'canceled' },
    });

    // Update user premium status
    await this.prisma.user.update({
      where: { id: existingSubscription.userId },
      data: { isPremium: false },
    });

    this.logger.log(`Subscription ${subscription.id} canceled`);
  }

  private async handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    const customerId =
      typeof invoice.customer === 'string'
        ? invoice.customer
        : invoice.customer?.id;

    if (!customerId) return;

    // Find user by stripe_customer_id
    const user = await this.prisma.user.findFirst({
      where: { stripeCustomerId: customerId },
    });

    if (!user) {
      this.logger.warn(`No user found for customer ${customerId}`);
      return;
    }

    // Find subscription for this user
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: { in: ['active', 'past_due', 'incomplete'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      this.logger.warn(`No active subscription found for user ${user.id}`);
      return;
    }

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'active',
        currentPeriodEnd: new Date(invoice.period_end * 1000),
      },
    });

    // Update user premium status
    await this.prisma.user.update({
      where: { id: user.id },
      data: { isPremium: true },
    });

    this.logger.log(
      `Invoice ${invoice.id} paid, subscription ${subscription.id} renewed`,
    );
  }

  private async handleInvoicePaymentFailed(
    invoice: Stripe.Invoice,
  ): Promise<void> {
    const customerId =
      typeof invoice.customer === 'string'
        ? invoice.customer
        : invoice.customer?.id;

    if (!customerId) return;

    const user = await this.prisma.user.findFirst({
      where: { stripeCustomerId: customerId },
    });

    if (!user) {
      this.logger.warn(`No user found for customer ${customerId}`);
      return;
    }

    const subscription = await this.prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: { in: ['active', 'past_due', 'incomplete'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      this.logger.warn(`No active subscription found for user ${user.id}`);
      return;
    }

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'past_due' },
    });

    this.logger.error(
      `Invoice ${invoice.id} payment failed, subscription ${subscription.id} past due`,
    );
  }

  private handleSetupIntentSucceeded(setupIntent: Stripe.SetupIntent): void {
    this.logger.log(`SetupIntent succeeded: ${setupIntent.id}`);
  }

  private handleSetupIntentCanceled(setupIntent: Stripe.SetupIntent): void {
    this.logger.log(`SetupIntent canceled: ${setupIntent.id}`);
  }
}
