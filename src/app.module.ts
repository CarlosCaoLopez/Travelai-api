import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { StripeModule } from './payments/stripe/stripe.module';
import { PaymentsModule } from './payments/payments.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { HomeModule } from './home/home.module';
import { ExploreModule } from './explore/explore.module';
import { ArtworksModule } from './artworks/artworks.module';
import { UserCollectionModule } from './user-collection/user-collection.module';
import { CameraModule } from './camera/camera.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { SyncModule } from './sync/sync.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    StripeModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        apiKey: config.get<string>('STRIPE_SECRET_KEY') || '',
        config: {
          apiVersion: '2025-10-29.clover',
        },
      }),
    }),
    PaymentsModule,
    SchedulerModule,
    HomeModule,
    ExploreModule,
    ArtworksModule,
    UserCollectionModule,
    CameraModule,
    WebhooksModule,
    SyncModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
