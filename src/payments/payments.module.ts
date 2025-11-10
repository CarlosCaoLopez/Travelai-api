import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { WebhooksController } from './webhooks.controller';

@Module({
  controllers: [PaymentsController, WebhooksController],
  providers: [
    PaymentsService,
    {
      provide: 'STRIPE_PUBLISHABLE_KEY',
      useFactory: (config: ConfigService) =>
        config.get<string>('STRIPE_PUBLISHABLE_KEY'),
      inject: [ConfigService],
    },
    {
      provide: 'STRIPE_WEBHOOK_SECRET',
      useFactory: (config: ConfigService) =>
        config.get<string>('STRIPE_WEBHOOK_SECRET'),
      inject: [ConfigService],
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
