import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { CategoriesService } from './categories/categories.service';
import { UsersService } from './users/users.service';

@Module({
  imports: [],
  controllers: [SyncController],
  providers: [CategoriesService, UsersService],
  exports: [UsersService],
})
export class SyncModule {}
