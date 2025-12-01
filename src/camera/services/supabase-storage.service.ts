import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseStorageService {
  private supabase: SupabaseClient;
  private readonly logger = new Logger(SupabaseStorageService.name);
  private readonly bucket: string;

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL') ?? '';
    const supabaseKey =
      this.configService.get<string>('SUPABASE_SERVICE_KEY') ?? '';
    this.bucket =
      this.configService.get<string>('SUPABASE_STORAGE_BUCKET', 'artworks') ??
      'artworks';

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Upload recognized artwork image with organized folder structure
   * Structure: artworks/{userId}/{artistName|countryName}/{filename}
   *
   * @param buffer Image buffer
   * @param fileName File name with extension
   * @param contentType MIME type
   * @param userId User ID (from JWT)
   * @param contextName Artist name or country name (sanitized)
   * @returns Storage path (not URL, client will fetch with their JWT)
   */
  async uploadRecognizedArtwork(
    buffer: Buffer,
    fileName: string,
    contentType: string,
    userId: string,
    contextName: string, // Artist name or country name
  ): Promise<string> {
    try {
      // Sanitize context name for folder (remove special chars, lowercase)
      const sanitizedContext = this.sanitizeForPath(contextName);

      // Structure: artworks/{userId}/{artistName|countryName}/{filename}
      const path = `${userId}/${sanitizedContext}/${fileName}`;

      this.logger.log(`Uploading to: ${this.bucket}/${path}`);

      const { data, error } = await this.supabase.storage
        .from(this.bucket)
        .upload(path, buffer, {
          contentType,
          upsert: false,
        });

      if (error) {
        this.logger.error(`Upload failed: ${error.message}`);
        throw error;
      }

      // Return the storage path (client will use their JWT to access)
      // Format: artworks/{userId}/{context}/{filename}
      return data.path;
    } catch (error) {
      this.logger.error(`Failed to upload to Supabase: ${error.message}`);
      throw error;
    }
  }

  /**
   * Sanitize string for use in storage path
   * Removes special characters and spaces, converts to lowercase
   */
  private sanitizeForPath(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD') // Decompose accented characters
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/[^a-z0-9]+/g, '_') // Replace non-alphanumeric with underscore
      .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
      .substring(0, 50); // Limit length
  }

  /**
   * Build the storage URL that client can access with their JWT
   * This returns the path that Supabase client will use with authentication
   */
  getStorageUrl(path: string): string {
    // Return path format that supabase-js client can use
    // Client will call: supabase.storage.from('artworks').download(path)
    return `${this.bucket}/${path}`;
  }

  async deleteImage(urlOrPath: string): Promise<void> {
    try {
      // Extract path from URL if needed
      const path = urlOrPath.includes('http')
        ? this.extractPath(urlOrPath)
        : urlOrPath;

      const { error } = await this.supabase.storage
        .from(this.bucket)
        .remove([path]);

      if (error) {
        this.logger.error(`Delete failed: ${error.message}`);
        throw error;
      }

      this.logger.log(`Deleted image: ${path}`);
    } catch (error) {
      this.logger.warn(`Failed to delete image: ${error.message}`);
    }
  }

  private extractPath(url: string): string {
    const match = url.match(/\/storage\/v1\/object\/public\/[^\/]+\/(.+)$/);
    return match ? match[1] : url;
  }
}
