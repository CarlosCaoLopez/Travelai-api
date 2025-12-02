import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { ObjectLocalizationResult } from '../dto/object-localization.dto';

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
  visuallySimilarImages: Array<{
    url: string;
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
          .filter((p) => p.url && !p.url.includes('collinsdictionary'))
          .map((p) => ({
            url: p.url!,
            pageTitle: p.pageTitle || undefined,
          })),
        visuallySimilarImages: (webDetection.visuallySimilarImages || [])
          .filter((img) => img.url && !img.url.includes('collinsdictionary'))
          .map((img) => ({
            url: img.url!,
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
        visuallySimilarImages: [],
        bestGuessLabels: [],
      };
    }
  }

  /**
   * Detect and localize objects in the image
   * Filters for artwork/monument-related objects
   * @param base64Image Base64 encoded image
   * @returns Object localization result with relevant objects
   */
  async detectObjects(base64Image: string): Promise<ObjectLocalizationResult> {
    try {
      this.logger.log('Detecting objects with Google Vision');

      // Extract base64 content (remove data URI prefix if present)
      const base64Content = base64Image.includes(',')
        ? base64Image.split(',')[1]
        : base64Image;

      // Perform object localization using annotateImage
      const [result] = await this.visionClient.annotateImage({
        image: { content: base64Content },
        features: [{ type: 'OBJECT_LOCALIZATION' }],
      });

      const localizedObjects = result.localizedObjectAnnotations || [];

      // Define relevant object categories for artworks and monuments
      const relevantCategories = [
        'Sculpture',
        'Statue',
        'Monument',
        'Building',
        'Artwork',
        'Painting',
        'Drawing',
        'Landmark',
        'Tower',
        'Arch',
        'Church',
        'Cathedral',
        'Palace',
        'Temple',
        'Fountain',
        'Wall',
        'Gate',
        'Bridge',
        'Architecture',
        'Historic site',
        'Memorial',
        'Tomb',
        'Ruins',
      ];

      // Filter and map objects
      const filteredObjects = localizedObjects
        .filter((obj) => {
          const name = obj.name || '';
          const score = obj.score || 0;
          // Check if object name matches any relevant category (case-insensitive)
          const isRelevant = relevantCategories.some((category) =>
            name.toLowerCase().includes(category.toLowerCase()),
          );
          // Only include objects with score >= 0.5
          return isRelevant && score >= 0.5;
        })
        .map((obj) => ({
          mid: obj.mid || undefined,
          name: obj.name || 'Unknown',
          score: obj.score || 0,
          boundingPoly: {
            normalizedVertices:
              obj.boundingPoly?.normalizedVertices?.map((v) => ({
                x: v.x || 0,
                y: v.y || 0,
              })) || [],
          },
        }))
        // Sort by confidence score (highest first)
        .sort((a, b) => b.score - a.score);

      this.logger.log(
        `Found ${filteredObjects.length} relevant objects out of ${localizedObjects.length} total`,
      );

      if (filteredObjects.length > 0) {
        this.logger.log(
          `Primary object: ${filteredObjects[0].name} (score: ${filteredObjects[0].score.toFixed(2)})`,
        );
      }

      return {
        objects: filteredObjects,
        hasRelevantObjects: filteredObjects.length > 0,
        primaryObject:
          filteredObjects.length > 0 ? filteredObjects[0] : undefined,
      };
    } catch (error) {
      this.logger.error(
        `Object localization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return {
        objects: [],
        hasRelevantObjects: false,
        primaryObject: undefined,
      };
    }
  }
}
