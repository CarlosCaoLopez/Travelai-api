import {
  Injectable,
  Logger,
  InternalServerErrorException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
  BadRequestException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, catchError, retry } from 'rxjs';

interface GooglePlace {
  place_id: string;
  name: string;
  vicinity: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  types: string[];
  rating?: number;
  user_ratings_total?: number;
  photos?: Array<{
    photo_reference: string;
  }>;
}

interface GooglePlacesResponse {
  results: GooglePlace[];
  status: string;
  next_page_token?: string;
}

@Injectable()
export class GooglePlacesService {
  private readonly logger = new Logger(GooglePlacesService.name);
  private readonly googleApiKey: string;
  private readonly baseUrl = 'https://maps.googleapis.com/maps/api/place';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.googleApiKey =
      this.configService.get<string>('GOOGLE_PLACES_API_KEY') || '';

    if (!this.googleApiKey) {
      this.logger.warn('GOOGLE_PLACES_API_KEY not configured');
    }
  }

  /**
   * Search for nearby cultural places using Google Places API
   *
   * @param latitude - User's latitude
   * @param longitude - User's longitude
   * @param radius - Search radius in meters
   * @param language - Language code (ISO 639-1)
   * @returns Array of Google Places
   */
  async searchNearby(
    latitude: number,
    longitude: number,
    radius: number,
    language: string = 'es',
  ): Promise<GooglePlace[]> {
    if (!this.googleApiKey) {
      throw new InternalServerErrorException(
        'Google Places API key not configured',
      );
    }

    const url = `${this.baseUrl}/nearbysearch/json`;
    const types =
      'museum|art_gallery|tourist_attraction|church|park|point_of_interest';

    this.logger.log(
      `Searching Google Places: lat=${latitude}, lng=${longitude}, radius=${radius}m, types=${types}`,
    );

    try {
      const response = await firstValueFrom(
        this.httpService
          .get<GooglePlacesResponse>(url, {
            params: {
              location: `${latitude},${longitude}`,
              radius: radius.toString(),
              type: types,
              language,
              key: this.googleApiKey,
            },
          })
          .pipe(
            retry({
              count: 1,
              delay: 1000,
            }),
            catchError((error) => {
              this.logger.error(
                `Google Places API HTTP error: ${error.message}`,
              );
              throw error;
            }),
          ),
      );

      const { status, results } = response.data;

      // Handle different API response statuses
      switch (status) {
        case 'OK':
          this.logger.log(`Found ${results.length} places from Google`);
          return results;

        case 'ZERO_RESULTS':
          this.logger.log('No places found in the specified area');
          return [];

        case 'OVER_QUERY_LIMIT':
          this.logger.error('Google Places API rate limit exceeded');
          throw new HttpException(
            'Rate limit exceeded. Please try again later.',
            HttpStatus.TOO_MANY_REQUESTS,
          );

        case 'REQUEST_DENIED':
          this.logger.error('Google Places API request denied - check API key');
          throw new InternalServerErrorException(
            'Places service temporarily unavailable',
          );

        case 'INVALID_REQUEST':
          this.logger.error('Invalid request to Google Places API');
          throw new BadRequestException('Invalid location parameters');

        default:
          this.logger.error(`Unknown Google Places API status: ${status}`);
          throw new InternalServerErrorException(
            'Failed to fetch nearby places',
          );
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(
        `Error calling Google Places API: ${error.message}`,
        error.stack,
      );
      throw new ServiceUnavailableException(
        'Places service temporarily unavailable',
      );
    }
  }

  /**
   * Map Google place types to human-readable categories
   *
   * @param types - Array of place types from Google
   * @returns Human-readable category string
   */
  mapTypeToCategory(types: string[]): string {
    const TYPE_TO_CATEGORY: Record<string, string> = {
      museum: 'Museo',
      art_gallery: 'Galería de Arte',
      tourist_attraction: 'Atracción Turística',
      church: 'Edificio Religioso',
      synagogue: 'Edificio Religioso',
      mosque: 'Edificio Religioso',
      park: 'Parque',
      point_of_interest: 'Punto de Interés',
    };

    // Find the most specific category
    for (const type of types) {
      if (TYPE_TO_CATEGORY[type]) {
        return TYPE_TO_CATEGORY[type];
      }
    }

    return 'Punto de Interés'; // Fallback
  }
}

export type { GooglePlace };
