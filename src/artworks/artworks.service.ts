import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type {
  ArtworkResponseDto,
  CategoryObjectDto,
} from './dto/artwork-response.dto';

@Injectable()
export class ArtworksService {
  private readonly logger = new Logger(ArtworksService.name);

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
}
