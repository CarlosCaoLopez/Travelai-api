import { DynamicModule, Module } from '@nestjs/common';
import Stripe from 'stripe';

export const STRIPE_CLIENT = 'STRIPE_CLIENT';

export interface StripeModuleOptions {
  apiKey: string;
  config?: Stripe.StripeConfig;
}

export interface StripeModuleAsyncOptions {
  useFactory: (
    ...args: any[]
  ) => Promise<StripeModuleOptions> | StripeModuleOptions;
  inject?: any[];
}

@Module({})
export class StripeModule {
  static forRoot(apiKey: string, config?: Stripe.StripeConfig): DynamicModule {
    const stripeProvider = {
      provide: STRIPE_CLIENT,
      useFactory: () => {
        return new Stripe(apiKey, {
          apiVersion: '2025-10-29.clover',
          typescript: true,
          ...config,
        });
      },
    };

    return {
      module: StripeModule,
      providers: [stripeProvider],
      exports: [stripeProvider],
      global: true,
    };
  }

  static forRootAsync(options: StripeModuleAsyncOptions): DynamicModule {
    const stripeProvider = {
      provide: STRIPE_CLIENT,
      useFactory: async (...args: any[]) => {
        const config = await options.useFactory(...args);
        return new Stripe(config.apiKey, {
          apiVersion: '2025-10-29.clover',
          typescript: true,
          ...config.config,
        });
      },
      inject: options.inject || [],
    };

    return {
      module: StripeModule,
      providers: [stripeProvider],
      exports: [stripeProvider],
      global: true,
    };
  }
}
