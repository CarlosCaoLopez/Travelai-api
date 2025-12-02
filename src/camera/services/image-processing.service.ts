import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { BoundingPoly } from '../dto/object-localization.dto';

@Injectable()
export class ImageProcessingService {
  private readonly logger = new Logger(ImageProcessingService.name);
  /**
   * Convert buffer to base64 string (without data URI prefix)
   */
  bufferToBase64(buffer: Buffer): string {
    return buffer.toString('base64');
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

  /**
   * Convert base64 string back to Buffer
   */
  base64ToBuffer(base64String: string): Buffer {
    return Buffer.from(base64String, 'base64');
  }

  /**
   * Get image dimensions from buffer
   */
  async getImageDimensions(
    buffer: Buffer,
  ): Promise<{ width: number; height: number }> {
    try {
      const metadata = await sharp(buffer).metadata();
      return {
        width: metadata.width || 0,
        height: metadata.height || 0,
      };
    } catch (error) {
      this.logger.error('Error getting image dimensions:', error);
      throw error;
    }
  }

  /**
   * Crop image by bounding box with normalized coordinates
   * @param buffer Original image buffer
   * @param boundingBox Bounding box with normalized vertices (0.0-1.0)
   * @returns Cropped image buffer
   */
  async cropByBoundingBox(
    buffer: Buffer,
    boundingBox: BoundingPoly,
  ): Promise<Buffer> {
    try {
      // Get image dimensions
      const { width, height } = await this.getImageDimensions(buffer);

      if (width === 0 || height === 0) {
        throw new Error('Invalid image dimensions');
      }

      // Convert normalized coordinates to pixel coordinates
      const vertices = boundingBox.normalizedVertices;
      if (!vertices || vertices.length === 0) {
        throw new Error('Invalid bounding box: no vertices');
      }

      const xCoords = vertices.map((v) => v.x * width);
      const yCoords = vertices.map((v) => v.y * height);

      // Find bounding rectangle
      const left = Math.max(0, Math.floor(Math.min(...xCoords)));
      const top = Math.max(0, Math.floor(Math.min(...yCoords)));
      const right = Math.min(width, Math.ceil(Math.max(...xCoords)));
      const bottom = Math.min(height, Math.ceil(Math.max(...yCoords)));

      const cropWidth = right - left;
      const cropHeight = bottom - top;

      // Validate crop dimensions
      if (cropWidth <= 0 || cropHeight <= 0) {
        throw new Error(`Invalid crop dimensions: ${cropWidth}x${cropHeight}`);
      }

      this.logger.log(
        `Cropping image: original=${width}x${height}, crop=${cropWidth}x${cropHeight} at (${left},${top})`,
      );

      // Crop using Sharp
      return await sharp(buffer)
        .extract({
          left,
          top,
          width: cropWidth,
          height: cropHeight,
        })
        .toBuffer();
    } catch (error) {
      this.logger.error('Error cropping image:', error);
      throw error;
    }
  }
}
