import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { StorageService } from './storage.service';

@Module({
  imports: [SupabaseModule],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
