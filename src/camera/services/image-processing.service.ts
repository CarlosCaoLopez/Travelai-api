import { Injectable } from '@nestjs/common';

@Injectable()
export class ImageProcessingService {
  /**
   * Convert buffer to base64 data URI for AI APIs
   */
  bufferToBase64(buffer: Buffer, mimeType: string): string {
    const base64 = buffer.toString('base64');
    return `data:${mimeType};base64,${base64}`;
  }

  /**
   * Generate unique filename for storage
   */
  generateFilename(userId: string, originalName: string): string {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(7);
    const extension = originalName.split('.').pop()?.toLowerCase() || 'jpg';
    return `${userId}_${timestamp}_${randomId}.${extension}`;
  }

  /**
   * Extract path from Supabase URL for deletion
   */
  extractPathFromUrl(url: string): string {
    const match = url.match(/\/storage\/v1\/object\/public\/[^\/]+\/(.+)$/);
    return match ? match[1] : '';
  }
}
