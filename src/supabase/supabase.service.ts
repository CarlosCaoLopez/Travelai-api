import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name);
  private supabase: SupabaseClient;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      this.logger.warn(
        'Supabase credentials not configured. Storage features will be disabled.',
      );
      return;
    }

    this.supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    this.logger.log('Supabase client initialized successfully');
  }

  getClient(): SupabaseClient {
    if (!this.supabase) {
      throw new Error('Supabase client not initialized');
    }
    return this.supabase;
  }

  get storage(): any {
    return this.getClient().storage;
  }

  /**
   * Delete a user from Supabase Auth
   * Requires service_role key with admin privileges
   */
  async deleteAuthUser(userId: string): Promise<void> {
    try {
      const { error } = await this.getClient().auth.admin.deleteUser(userId);

      if (error) {
        this.logger.error(
          `Failed to delete Supabase Auth user ${userId}: ${error.message}`,
        );
        throw new Error(`Supabase Auth deletion failed: ${error.message}`);
      }

      this.logger.log(`Successfully deleted Supabase Auth user: ${userId}`);
    } catch (error) {
      this.logger.error(
        `Error deleting Supabase Auth user ${userId}:`,
        error,
      );
      throw error;
    }
  }
}
