import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { CategoriesService } from './categories/categories.service';
import { UsersService } from './users/users.service';
import { UserArtworksModule } from './user-artworks/user-artworks.module';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [UserArtworksModule, SupabaseModule],
  controllers: [SyncController],
  providers: [CategoriesService, UsersService],
  exports: [UsersService],
})
export class SyncModule {}
