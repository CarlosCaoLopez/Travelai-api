import { Module } from '@nestjs/common';
import { UserCollectionController } from './user-collection.controller';
import { UserCollectionService } from './user-collection.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [UserCollectionController],
  providers: [UserCollectionService],
})
export class UserCollectionModule {}
