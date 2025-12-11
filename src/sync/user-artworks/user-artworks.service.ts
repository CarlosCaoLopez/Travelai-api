import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UserArtworkResponseDto } from './dto/user-artwork-response.dto';

@Injectable()
export class UserArtworksService {
  private readonly logger = new Logger(UserArtworksService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getUserArtworks(
    userId: string,
    language: string = 'es',
    updatedAfter?: Date,
  ): Promise<UserArtworkResponseDto[]> {
    try {
      this.logger.log(
        `Fetching artworks for user: ${userId}, language: ${language}, updatedAfter: ${updatedAfter?.toISOString() || 'none'}`,
      );

      // Fetch all collection items for the user with related data
      const collectionItems = await this.prisma.userCollectionItem.findMany({
        where: {
          userId,
          ...(updatedAfter && {
            updatedAt: {
              gt: updatedAfter,
            },
          }),
        },
        include: {
          artwork: {
            include: {
              author: true,
              category: {
                include: {
                  translations: {
                    where: {
                      language: {
                        in: [language, 'es'], // Always fetch requested language + Spanish fallback
                      },
                    },
                  },
                },
              },
              country: {
                include: {
                  translations: {
                    where: {
                      language: {
                        in: [language, 'es'],
                      },
                    },
                  },
                },
              },
              translations: {
                where: {
                  language: {
                    in: [language, 'es'],
                  },
                },
              },
            },
          },
          customCategory: {
            include: {
              translations: {
                where: {
                  language: {
                    in: [language, 'es'],
                  },
                },
              },
            },
          },
        },
        orderBy: {
          identifiedAt: 'desc',
        },
      });

      this.logger.log(`Found ${collectionItems.length} artworks for user`);

      // Transform to match API response format
      const artworks: UserArtworkResponseDto[] = collectionItems.map((item) => {
        if (item.artwork) {
          // Linked artwork - prefer requested language, fallback to Spanish
          const translation =
            item.artwork.translations.find((t) => t.language === language) ||
            item.artwork.translations.find((t) => t.language === 'es');

          const categoryTranslation =
            item.artwork.category.translations.find(
              (t) => t.language === language,
            ) ||
            item.artwork.category.translations.find((t) => t.language === 'es');

          const countryTranslation =
            item.artwork.country.translations.find(
              (t) => t.language === language,
            ) ||
            item.artwork.country.translations.find((t) => t.language === 'es');

          return {
            id: item.id,
            userId: item.userId,
            artworkId: item.artwork.id,
            title: translation?.title || '',
            author: item.artwork.author.name,
            year: item.artwork.year,
            period: categoryTranslation?.name || null,
            technique: translation?.technique || null,
            dimensions: item.artwork.dimensions,
            country:
              countryTranslation?.name || item.artwork.country.defaultName,
            description: translation?.description || null,
            localUri: item.capturedImageUrl,
            identifiedAt: item.identifiedAt.toISOString(),
            createdAt: item.createdAt.toISOString(),
            updatedAt: item.updatedAt.toISOString(),
          };
        } else {
          // Custom/snapshot artwork
          const customCategoryTranslation = item.customCategory
            ? item.customCategory.translations.find(
                (t) => t.language === language,
              ) ||
              item.customCategory.translations.find((t) => t.language === 'es')
            : null;

          return {
            id: item.id,
            userId: item.userId,
            artworkId: null,
            title: item.customTitle || '',
            author: item.customAuthor || '',
            year: item.customYear || null,
            period: customCategoryTranslation?.name || null,
            technique: item.customTechnique || null,
            dimensions: item.customDimensions || null,
            country: item.customCountry || null,
            description: item.customDescription || null,
            localUri: item.capturedImageUrl,
            identifiedAt: item.identifiedAt.toISOString(),
            createdAt: item.createdAt.toISOString(),
            updatedAt: item.updatedAt.toISOString(),
          };
        }
      });

      return artworks;
    } catch (error) {
      this.logger.error(`Error fetching user artworks: ${error.message}`, error.stack);
      throw error;
    }
  }
}
