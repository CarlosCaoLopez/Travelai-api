import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { randomUUID } from 'crypto';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(private supabaseService: SupabaseService) {}

  /**
   * Upload artwork photo anonymously to Supabase Storage
   * File naming: {sanitized_title}_{sanitized_author}_{timestamp}_{uuid}.{ext}
   */
  async uploadArtworkPhotoAnonymous(
    title: string | null,
    author: string | null,
    fileBuffer: Buffer,
    mimeType: string,
  ): Promise<{ filename: string; publicUrl: string }> {
    const extension = this.getExtensionFromMimeType(mimeType);
    const filename = this.generateAnonymousArtworkFilename(
      title,
      author,
      extension,
    );

    try {
      const { data, error } = await this.supabaseService.storage
        .from('artworks')
        .upload(filename, fileBuffer, {
          contentType: mimeType,
          upsert: false,
        });

      if (error) {
        this.logger.error(`Upload failed: ${error.message}`, error);
        throw new Error(`Failed to upload: ${error.message}`);
      }

      const publicUrl = this.getPublicUrl('artworks', data.path);

      return { filename, publicUrl };
    } catch (error) {
      this.logger.error('Upload error:', error);
      throw error;
    }
  }

  /**
   * Generate anonymous filename for artwork photo
   * Format: {title}_{author}_{timestamp}_{uuid}.{ext}
   */
  private generateAnonymousArtworkFilename(
    title: string | null,
    author: string | null,
    extension: string,
  ): string {
    const sanitizedTitle = this.sanitizeForFilename(title || 'not_found');
    const sanitizedAuthor = this.sanitizeForFilename(author || 'not_found');
    const timestamp = Date.now();
    const uuid = randomUUID().split('-')[0]; // First 8 chars

    return `${sanitizedTitle}_${sanitizedAuthor}_${timestamp}_${uuid}.${extension}`;
  }

  /**
   * Sanitize text for use in filename
   * - Lowercase
   * - Remove accents
   * - Remove special characters
   * - Replace spaces with underscores
   * - Max 50 chars
   */
  private sanitizeForFilename(text: string): string {
    return (
      text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[^a-z0-9\s]/g, '') // Remove special chars
        .replace(/\s+/g, '_') // Spaces to underscores
        .substring(0, 50) // Max length
        .replace(/^_+|_+$/g, '') || 'unknown'
    ); // Trim underscores, fallback
  }

  /**
   * Get file extension from MIME type
   */
  private getExtensionFromMimeType(mimeType: string): string {
    const mimeMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/heic': 'heic',
      'image/webp': 'webp',
    };

    return mimeMap[mimeType.toLowerCase()] || 'jpg';
  }

  /**
   * Generate public URL for uploaded file
   */
  private getPublicUrl(bucketName: string, filePath: string): string {
    const { data } = this.supabaseService.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    return data.publicUrl;
  }

  /**
   * Upload image to temporary bucket for external API processing
   * Used for DataForSEO Google Lens reverse image search
   */
  async uploadToTempBucket(
    buffer: Buffer,
    filename: string,
  ): Promise<{ publicUrl: string; path: string }> {
    const timestamp = Date.now();
    const path = `lens-search/${timestamp}-${filename}`;

    try {
      const { data, error } = await this.supabaseService.storage
        .from('temp_artworks')
        .upload(path, buffer, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (error) {
        this.logger.error(
          `Failed to upload to temp bucket: ${error.message}`,
          error,
        );
        throw new Error(`Failed to upload to temp bucket: ${error.message}`);
      }

      const publicUrl = this.getPublicUrl('temp_artworks', data.path);

      this.logger.log(`Uploaded to temp bucket: ${path}`);
      return { publicUrl, path };
    } catch (error) {
      this.logger.error('Temp bucket upload error:', error);
      throw error;
    }
  }

  /**
   * Delete file from temporary bucket
   */
  async deleteFromTempBucket(path: string): Promise<void> {
    try {
      const { error } = await this.supabaseService.storage
        .from('temp_artworks')
        .remove([path]);

      if (error) {
        this.logger.error(
          `Failed to delete from temp bucket: ${error.message}`,
        );
        // Don't throw - this is cleanup, not critical
      } else {
        this.logger.log(`Deleted from temp bucket: ${path}`);
      }
    } catch (error) {
      this.logger.error('Temp bucket delete error:', error);
      // Don't throw - this is cleanup, not critical
    }
  }
}
