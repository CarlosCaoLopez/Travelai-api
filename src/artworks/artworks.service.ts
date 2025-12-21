import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type {
  ArtworkResponseDto,
  CategoryObjectDto,
} from './dto/artwork-response.dto';

@Injectable()
export class ArtworksService {
  private readonly logger = new Logger(ArtworksService.name);

  // Cache for daily artwork recommendation
  private dailyRecommendationCache: {
    date: string; // YYYY-MM-DD format
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

      const translation = artwork.translations[0];
      const countryTranslation = artwork.country.translations[0];
      const categoryTranslation = artwork.category.translations[0];

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
        const translation = artwork.translations[0];
        const countryTranslation = artwork.country.translations[0];
        const categoryTranslation = artwork.category.translations[0];

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
   * Returns the same artwork for all users on a given day.
   * Cache is automatically invalidated when the date changes.
   */
  async getDailyRecommendation(
    userId: string,
    language: string = 'es',
  ): Promise<ArtworkResponseDto> {
    this.logger.log(
      `Getting daily recommendation for user: ${userId}, language: ${language}`,
    );

    // Get current date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];

    // Check if we have a valid cached recommendation for today
    if (this.dailyRecommendationCache?.date === today) {
      this.logger.log(
        `Returning cached daily recommendation: ${this.dailyRecommendationCache.artworkId}`,
      );
      // Return the cached artwork
      return this.getArtworkById(
        this.dailyRecommendationCache.artworkId,
        language,
      );
    }

    // Generate a new recommendation
    this.logger.log('Generating new daily recommendation');
    const artwork = await this.generateRandomRecommendation(language);

    // Cache the recommendation
    this.dailyRecommendationCache = {
      date: today,
      artworkId: artwork.id,
    };

    this.logger.log(
      `Daily recommendation generated and cached: ${artwork.title} (${artwork.id})`,
    );

    return artwork;
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
      const translation = artwork.translations[0];
      const countryTranslation = artwork.country.translations[0];
      const categoryTranslation = artwork.category.translations[0];

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
