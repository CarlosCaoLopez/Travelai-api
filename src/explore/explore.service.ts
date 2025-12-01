import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { GooglePlacesService } from './services/google-places.service';
import { QwenService } from './services/qwen.service';
import { calculateDistance } from './utils/distance.util';
import { formatWalkingTime } from './utils/time-format.util';
import type {
  ArtworkResponseDto,
  ArtworksListResponseDto,
  CategoryObjectDto,
} from './dto/artwork-response.dto';
import type { GetNearbyLocationsQueryDto } from './dto/get-nearby-locations-query.dto';
import type {
  NearbyLocationsResponseDto,
  LocationDto,
} from './dto/nearby-locations-response.dto';

interface GetArtworksParams {
  categoryId?: string;
  subcategoryId?: string;
  country?: string;
  language?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class ExploreService {
  private readonly logger = new Logger(ExploreService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly googlePlacesService: GooglePlacesService,
    private readonly qwenService: QwenService,
  ) {}

  async getArtworks(
    params: GetArtworksParams,
  ): Promise<ArtworksListResponseDto> {
    const {
      categoryId,
      subcategoryId,
      country,
      language = 'es',
      limit = 20,
      offset = 0,
    } = params;

    this.logger.log(
      `Fetching artworks with filters: ${JSON.stringify(params)}`,
    );

    try {
      // Build the where clause dynamically
      const where: any = {};

      if (categoryId) {
        where.categoryId = categoryId;
      }

      if (subcategoryId) {
        where.subcategoryId = subcategoryId;
      }

      if (country) {
        where.countryCode = country;
      }

      // Get total count for pagination
      const total = await this.prisma.artwork.count({ where });

      // Fetch artworks with relations
      const artworks = await this.prisma.artwork.findMany({
        where,
        include: {
          author: {
            select: {
              name: true,
            },
          },
          country: {
            include: {
              translations: {
                where: {
                  language,
                },
              },
            },
          },
          category: {
            include: {
              translations: {
                where: {
                  language,
                },
              },
            },
          },
          subcategory: {
            include: {
              translations: {
                where: {
                  language,
                },
              },
            },
          },
          translations: {
            where: {
              language,
            },
          },
        },
        skip: offset,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
      });

      // Map to response format
      const mappedArtworks: ArtworkResponseDto[] = artworks.map((artwork) => {
        const translation = artwork.translations[0];
        const countryTranslation = artwork.country.translations[0];
        const categoryTranslation = artwork.category.translations[0];
        const subcategoryTranslation = artwork.subcategory?.translations[0];

        const category: CategoryObjectDto = {
          id: artwork.category.id,
          name: categoryTranslation?.name || artwork.category.id,
          icon: artwork.category.icon,
        };

        const subcategory: CategoryObjectDto | null = artwork.subcategory
          ? {
              id: artwork.subcategory.id,
              name: subcategoryTranslation?.name || artwork.subcategory.id,
              icon: artwork.subcategory.icon,
            }
          : null;

        return {
          id: artwork.id,
          title: translation?.title || 'Untitled',
          author: artwork.author.name,
          year: artwork.year,
          country: countryTranslation?.name || artwork.country.defaultName,
          period: translation?.period || null,
          technique: translation?.technique || null,
          dimensions: artwork.dimensions,
          imageUrl: artwork.imageUrl,
          description: translation?.description || '',
          category,
          subcategory,
          createdAt: artwork.createdAt.toISOString(),
          updatedAt: artwork.updatedAt.toISOString(),
        };
      });

      const hasMore = offset + limit < total;

      this.logger.log(
        `Retrieved ${mappedArtworks.length} artworks out of ${total} total`,
      );

      return {
        artworks: mappedArtworks,
        pagination: {
          total,
          limit,
          offset,
          hasMore,
        },
        filters: {
          category_id: categoryId,
          subcategory_id: subcategoryId,
          country,
          language,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error fetching artworks: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Get nearby cultural locations using Google Places API and enrich with LLM descriptions
   */
  async getNearbyLocations(
    query: GetNearbyLocationsQueryDto,
  ): Promise<NearbyLocationsResponseDto> {
    const {
      latitude,
      longitude,
      maxDistance = 5000,
      language = 'es',
      limit = 10,
    } = query;

    this.logger.log(
      `Searching nearby locations for lat: ${latitude}, lng: ${longitude}, radius: ${maxDistance}m, language: ${language}`,
    );

    try {
      // 1. Fetch places from Google Places API
      const googlePlaces = await this.googlePlacesService.searchNearby(
        latitude,
        longitude,
        maxDistance,
        language,
      );

      if (!googlePlaces || googlePlaces.length === 0) {
        this.logger.log('No places found');
        return { locations: [], count: 0 };
      }

      // 2. Calculate distances for each place
      const placesWithDistance = googlePlaces.map((place) => ({
        ...place,
        distance: calculateDistance(
          latitude,
          longitude,
          place.geometry.location.lat,
          place.geometry.location.lng,
        ),
      }));

      // 3. Filter by maxDistance (Google may return places outside the radius)
      const filteredPlaces = placesWithDistance.filter(
        (place) => place.distance <= maxDistance,
      );

      // 4. Sort by distance (ascending - closest first)
      const sortedPlaces = filteredPlaces.sort(
        (a, b) => a.distance - b.distance,
      );

      // 5. Limit results
      const limitedPlaces = sortedPlaces.slice(0, limit);

      this.logger.log(
        `Found ${limitedPlaces.length} places within ${maxDistance}m`,
      );

      // 6. Enrich with LLM descriptions in parallel
      const enrichmentPromises = limitedPlaces.map(async (place) => {
        const category = this.googlePlacesService.mapTypeToCategory(
          place.types,
        );
        const description = await this.qwenService.generateDescription(
          place.name,
          category,
          language,
        );

        return {
          id: place.place_id,
          title: place.name,
          description,
          category,
          distance: place.distance,
          estimatedTime: formatWalkingTime(place.distance, language),
        };
      });

      // Use Promise.allSettled to handle individual failures gracefully
      const enrichedResults = await Promise.allSettled(enrichmentPromises);

      // Filter only successful results
      const locations: LocationDto[] = enrichedResults
        .filter((result) => result.status === 'fulfilled')
        .map((result) => (result as PromiseFulfilledResult<LocationDto>).value);

      this.logger.log(
        `Successfully enriched ${locations.length}/${limitedPlaces.length} locations`,
      );

      return {
        locations,
        count: locations.length,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Error fetching nearby locations: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(
        'Failed to fetch nearby locations',
      );
    }
  }
}
