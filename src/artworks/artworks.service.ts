import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type {
  ArtworkResponseDto,
  CategoryObjectDto,
} from './dto/artwork-response.dto';
import { getMadridDateString } from '../common/utils/madrid-date.util';

@Injectable()
export class ArtworksService {
  private readonly logger = new Logger(ArtworksService.name);

  // Cache for daily artwork recommendation (Madrid timezone, changes at 20:00)
  private dailyRecommendationCache: {
    madridDate: string; // YYYY-MM-DD format in Madrid timezone (after 20:00 = next day)
    artworkId: string;
  } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async getArtworkById(
    id: string,
    language: string = 'es',
  ): Promise<ArtworkResponseDto> {
    this.logger.log(`Fetching artwork with id: ${id}, language: ${language}`);

    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      this.logger.warn(`Invalid UUID format: ${id}`);
      throw new NotFoundException(`Artwork with id ${id} not found`);
    }

    try {
      const artwork = await this.prisma.artwork.findUnique({
        where: { id },
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
          translations: {
            where: {
              language,
            },
          },
        },
      });

      if (!artwork) {
        this.logger.warn(`Artwork with id ${id} not found`);
        throw new NotFoundException(`Artwork with id ${id} not found`);
      }

      const translation = artwork.translations.find(
        (t) => t.language === language,
      ) || artwork.translations[0];
      const countryTranslation = artwork.country.translations.find(
        (t) => t.language === language,
      ) || artwork.country.translations[0];
      const categoryTranslation = artwork.category.translations.find(
        (t) => t.language === language,
      ) || artwork.category.translations[0];

      const category: CategoryObjectDto = {
        id: artwork.category.id,
        name: categoryTranslation?.name || artwork.category.id,
        icon: artwork.category.icon,
      };

      const response: ArtworkResponseDto = {
        id: artwork.id,
        title: translation?.title || 'Untitled',
        author: artwork.author.name,
        year: artwork.year,
        country: countryTranslation?.name || artwork.country.defaultName,
        period: categoryTranslation?.name || null,
        technique: translation?.technique || null,
        dimensions: artwork.dimensions,
        imageUrl: artwork.imageUrl,
        description: translation?.description || '',
        category,
        createdAt: artwork.createdAt.toISOString(),
        updatedAt: artwork.updatedAt.toISOString(),
      };

      this.logger.log(`Successfully retrieved artwork: ${response.title}`);
      return response;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error fetching artwork: ${errorMessage}`);
      throw error;
    }
  }

  async searchArtworks(
    query: string,
    language: string = 'es',
    limit: number = 20,
    offset: number = 0,
  ): Promise<{
    results: ArtworkResponseDto[];
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
    query: string;
  }> {
    this.logger.log(
      `Searching artworks with query: "${query}", language: ${language}, limit: ${limit}, offset: ${offset}`,
    );

    try {
      // Build the search condition
      const searchCondition = {
        OR: [
          {
            author: {
              name: {
                contains: query,
                mode: 'insensitive' as const,
              },
            },
          },
          {
            translations: {
              some: {
                title: {
                  contains: query,
                  mode: 'insensitive' as const,
                },
                language,
              },
            },
          },
        ],
      };

      // Get total count
      const total = await this.prisma.artwork.count({
        where: searchCondition,
      });

      // Get paginated results
      const artworks = await this.prisma.artwork.findMany({
        where: searchCondition,
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

      // Map to response DTOs
      const results: ArtworkResponseDto[] = artworks.map((artwork) => {
        const translation = artwork.translations.find(
          (t) => t.language === language,
        ) || artwork.translations[0];
        const countryTranslation = artwork.country.translations.find(
          (t) => t.language === language,
        ) || artwork.country.translations[0];
        const categoryTranslation = artwork.category.translations.find(
          (t) => t.language === language,
        ) || artwork.category.translations[0];

        const category: CategoryObjectDto = {
          id: artwork.category.id,
          name: categoryTranslation?.name || artwork.category.id,
          icon: artwork.category.icon,
        };

        return {
          id: artwork.id,
          title: translation?.title || 'Untitled',
          author: artwork.author.name,
          year: artwork.year,
          country: countryTranslation?.name || artwork.country.defaultName,
          period: categoryTranslation?.name || null,
          technique: translation?.technique || null,
          dimensions: artwork.dimensions,
          imageUrl: artwork.imageUrl,
          description: translation?.description || '',
          category,
          createdAt: artwork.createdAt.toISOString(),
          updatedAt: artwork.updatedAt.toISOString(),
        };
      });

      const hasMore = offset + limit < total;

      this.logger.log(
        `Search completed: found ${total} results, returning ${results.length}`,
      );

      return {
        results,
        pagination: {
          total,
          limit,
          offset,
          hasMore,
        },
        query,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error searching artworks: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Get daily artwork recommendation for the authenticated user.
   * Returns the same artwork for all users on a given day (Madrid timezone).
   * The day changes at 20:00 Madrid time.
   * Cache is automatically invalidated when the Madrid date changes.
   */
  async getDailyRecommendation(
    userId: string,
    language: string = 'es',
  ): Promise<ArtworkResponseDto> {
    this.logger.log(
      `Getting daily recommendation for user: ${userId}, language: ${language}`,
    );

    // Get current date in Madrid timezone (changes at 20:00)
    const currentMadridDate = getMadridDateString();
    this.logger.log(`Current Madrid date: ${currentMadridDate}`);

    // Check if we have a valid cached recommendation for current Madrid date
    if (this.dailyRecommendationCache?.madridDate === currentMadridDate) {
      this.logger.log(
        `Returning cached daily recommendation: ${this.dailyRecommendationCache.artworkId}`,
      );
      // Return the cached artwork
      return this.getArtworkById(
        this.dailyRecommendationCache.artworkId,
        language,
      );
    }

    // Cache miss or date changed - fetch from database
    this.logger.log('Cache miss - fetching from database');
    const artworkId = await this.getOrUpdateDailyRecommendation(
      currentMadridDate,
    );

    // Update in-memory cache
    this.dailyRecommendationCache = {
      madridDate: currentMadridDate,
      artworkId,
    };

    this.logger.log(
      `Daily recommendation loaded from DB and cached: ${artworkId}`,
    );

    return this.getArtworkById(artworkId, language);
  }

  /**
   * Get or update the daily recommendation from database.
   * If the date matches current Madrid date, return existing artwork.
   * If date is different, update with a new random artwork.
   * This method always updates the same row (singleton pattern).
   */
  private async getOrUpdateDailyRecommendation(
    madridDate: string,
  ): Promise<string> {
    // Try to get existing daily recommendation (should always exist after initial setup)
    const existing = await this.prisma.dailyRecommendation.findFirst();

    if (!existing) {
      // Should not happen after initial setup, but handle gracefully
      this.logger.warn('No daily recommendation found in DB - creating initial');
      const artwork = await this.generateRandomRecommendation('es');
      const created = await this.prisma.dailyRecommendation.create({
        data: {
          currentDate: madridDate,
          artworkId: artwork.id,
        },
      });
      return created.artworkId;
    }

    // Check if date matches
    if (existing.currentDate === madridDate) {
      this.logger.log(
        `DB date matches (${madridDate}) - returning existing artwork: ${existing.artworkId}`,
      );
      return existing.artworkId;
    }

    // Date changed - update with new random artwork
    this.logger.log(
      `DB date changed (${existing.currentDate} -> ${madridDate}) - generating new artwork`,
    );
    const newArtwork = await this.generateRandomRecommendation('es');
    const updated = await this.prisma.dailyRecommendation.update({
      where: { id: existing.id },
      data: {
        currentDate: madridDate,
        artworkId: newArtwork.id,
        updatedAt: new Date(),
      },
    });

    this.logger.log(`DB updated with new artwork: ${updated.artworkId}`);
    return updated.artworkId;
  }

  /**
   * Generate a random artwork recommendation from the catalog.
   * This is a private helper method used by getDailyRecommendation.
   */
  private async generateRandomRecommendation(
    language: string = 'es',
  ): Promise<ArtworkResponseDto> {
    this.logger.log('Generating random artwork recommendation');

    try {
      // Count total artworks in the catalog
      const totalCount = await this.prisma.artwork.count();

      if (totalCount === 0) {
        throw new NotFoundException('No artworks available in the catalog');
      }

      this.logger.log(`Total artworks in catalog: ${totalCount}`);

      // Generate a random index
      const randomIndex = Math.floor(Math.random() * totalCount);
      this.logger.log(`Selected random index: ${randomIndex}`);

      // Fetch the artwork at that index
      const artworks = await this.prisma.artwork.findMany({
        skip: randomIndex,
        take: 1,
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
          translations: {
            where: {
              language,
            },
          },
        },
      });

      if (!artworks || artworks.length === 0) {
        throw new NotFoundException(
          'Failed to generate artwork recommendation',
        );
      }

      const artwork = artworks[0];
      const translation = artwork.translations.find(
        (t) => t.language === language,
      ) || artwork.translations[0];
      const countryTranslation = artwork.country.translations.find(
        (t) => t.language === language,
      ) || artwork.country.translations[0];
      const categoryTranslation = artwork.category.translations.find(
        (t) => t.language === language,
      ) || artwork.category.translations[0];

      const category: CategoryObjectDto = {
        id: artwork.category.id,
        name: categoryTranslation?.name || artwork.category.id,
        icon: artwork.category.icon,
      };

      const response: ArtworkResponseDto = {
        id: artwork.id,
        title: translation?.title || 'Untitled',
        author: artwork.author.name,
        year: artwork.year,
        country: countryTranslation?.name || artwork.country.defaultName,
        period: categoryTranslation?.name || null,
        technique: translation?.technique || null,
        dimensions: artwork.dimensions,
        imageUrl: artwork.imageUrl,
        description: translation?.description || '',
        category,
        createdAt: artwork.createdAt.toISOString(),
        updatedAt: artwork.updatedAt.toISOString(),
      };

      this.logger.log(`Generated recommendation: ${response.title}`);
      return response;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Error generating random recommendation: ${errorMessage}`,
      );
      throw error;
    }
  }
}
