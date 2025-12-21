import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { DatabaseModule } from '../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [DatabaseModule, NotificationsModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
