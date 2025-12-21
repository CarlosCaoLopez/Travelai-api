import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { DataForSEOConfigService } from './dataforseo-config.service';
import { GoogleLensResult } from './dto/google-lens-result.dto';

@Injectable()
export class GoogleLensService {
  private readonly logger = new Logger(GoogleLensService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: DataForSEOConfigService,
  ) {}

  async reverseImageSearch(imageUrl: string): Promise<GoogleLensResult> {
    const startTime = Date.now();

    // Check if DataForSEO is configured
    if (!this.configService.isConfigured()) {
      this.logger.warn(
        'DataForSEO not configured, skipping Google Lens search',
      );
      return {
        success: false,
        urls: [],
        items: [],
        error: 'not_configured',
      };
    }

    try {
      this.logger.log(`Starting Google Lens search for image: ${imageUrl}`);

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.configService.getBaseUrl()}/serp/google/search_by_image/live/advanced`,
          [
            {
              image_url: imageUrl,
              language_code: 'es',
              location_code: 2724, // Spain
            },
          ],
          {
            headers: {
              Authorization: this.configService.getAuthHeader(),
              'Content-Type': 'application/json',
            },
            timeout: 60000, // 60 seconds
          },
        ),
      );

      const task = response.data.tasks?.[0];

      // Check task status
      if (!task) {
        throw new Error('No task returned from DataForSEO');
      }

      if (task.status_code !== 20000) {
        throw new Error(
          `DataForSEO task failed with status ${task.status_code}: ${task.status_message || 'Unknown error'}`,
        );
      }

      // Extract items from result
      const items = task.result?.[0]?.items || [];

      // Buscamos 'organic' (páginas con la imagen) y 'visual_matches' (imágenes similares)
      const relevantItems = items.filter(
        (item) => item.type === 'organic' || item.type === 'visual_matches',
      );

      const urls = relevantItems
        .filter((item) => item.url)
        .map((item) => item.url);

      const timeTaken = Date.now() - startTime;
      const cost = task.cost || 0;

      this.logger.log(
        `Google Lens search completed in ${timeTaken}ms: found ${urls.length} URLs (cost: $${cost})`,
      );

      // Log all URLs found
      if (urls.length > 0) {
        this.logger.log('📋 URLs found by Google Lens:');
        urls.forEach((url, index) => {
          this.logger.log(`  ${index + 1}. ${url}`);
        });
      }

      return {
        success: true,
        urls,
        items,
        cost,
      };
    } catch (error) {
      const timeTaken = Date.now() - startTime;
      this.logger.error(
        `Google Lens search failed in ${timeTaken}ms: ${error.message}`,
      );

      // Determine error type
      let errorType = 'unknown';

      if (error.response) {
        const status = error.response.status;
        if (status === 401 || status === 403) {
          errorType = 'auth_failed';
          this.logger.error('Authentication failed - check credentials');
        } else if (status === 429) {
          errorType = 'rate_limit';
          this.logger.error('Rate limit exceeded');
        } else if (status >= 500) {
          errorType = 'server_error';
          this.logger.error(`Server error: ${status}`);
        } else {
          errorType = 'client_error';
        }
      } else if (error.code === 'ECONNABORTED') {
        errorType = 'timeout';
        this.logger.error('Request timed out after 60 seconds');
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        errorType = 'network_error';
      }

      return {
        success: false,
        urls: [],
        items: [],
        error: errorType,
      };
    }
  }
}
