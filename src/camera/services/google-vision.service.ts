import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageAnnotatorClient } from '@google-cloud/vision';

export interface WebDetection {
  webEntities: Array<{
    entityId?: string;
    score?: number;
    description?: string;
  }>;
  pagesWithMatchingImages: Array<{
    url: string;
    pageTitle?: string;
  }>;
  bestGuessLabels: Array<{
    label: string;
    languageCode?: string;
  }>;
}

@Injectable()
export class GoogleVisionService {
  private readonly logger = new Logger(GoogleVisionService.name);
  private readonly visionClient: ImageAnnotatorClient;

  constructor(private readonly configService: ConfigService) {
    // Initialize Vision client with API key or credentials
    const apiKey = this.configService.get<string>('GOOGLE_VISION_API_KEY');
    const credentialsPath = this.configService.get<string>(
      'GOOGLE_VISION_KEY_PATH',
    );

    if (apiKey) {
      // Use API key (simpler approach)
      this.visionClient = new ImageAnnotatorClient({
        apiKey,
      });
    } else if (credentialsPath) {
      // Use service account file
      this.visionClient = new ImageAnnotatorClient({
        keyFilename: credentialsPath,
      });
    } else {
      // Fallback to default credentials
      this.visionClient = new ImageAnnotatorClient();
    }
  }

  async detectWeb(
    base64Image: string,
    language: string = 'es',
  ): Promise<WebDetection> {
    try {
      this.logger.log(
        `Detecting web entities with Google Vision (language: ${language})`,
      );

      // Extract base64 content (remove data URI prefix if present)
      const base64Content = base64Image.includes(',')
        ? base64Image.split(',')[1]
        : base64Image;

      // Perform web detection using the official client library
      const [result] = await this.visionClient.webDetection({
        image: { content: base64Content },
      });

      const webDetection = result.webDetection || {};

      return {
        webEntities: (webDetection.webEntities || []).map((e) => ({
          entityId: e.entityId || undefined,
          score: e.score || undefined,
          description: e.description || undefined,
        })),
        pagesWithMatchingImages: (webDetection.pagesWithMatchingImages || [])
          .filter((p) => p.url)
          .map((p) => ({
            url: p.url!,
            pageTitle: p.pageTitle || undefined,
          })),
        bestGuessLabels: (webDetection.bestGuessLabels || [])
          .filter((l) => l.label)
          .map((l) => ({
            label: l.label!,
            languageCode: l.languageCode || undefined,
          })),
      };
    } catch (error) {
      this.logger.error(`Google Vision detection failed: ${error.message}`);
      return {
        webEntities: [],
        pagesWithMatchingImages: [],
        bestGuessLabels: [],
      };
    }
  }
}
