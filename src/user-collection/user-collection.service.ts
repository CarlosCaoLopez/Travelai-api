import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { IdentifyArtworkDto } from './dto/identify-artwork.dto';

export interface CollectionStats {
  totalArtworks: number;
  totalArtists: number;
}

export interface ArtistInCollection {
  artist: string;
  artworkCount: number;
}

export interface CountryInCollection {
  country: string;
  artworkCount: number;
}

export interface CollectionSummary {
  stats: CollectionStats;
  artistsInCollection: ArtistInCollection[];
  countriesInCollection: CountryInCollection[];
}

@Injectable()
export class UserCollectionService {
  constructor(private prisma: PrismaService) {}

  async getCollectionSummary(
    userId: string,
    language: string = 'es',
  ): Promise<CollectionSummary> {
    // Fetch all collection items for the user with related data
    const collectionItems = await this.prisma.userCollectionItem.findMany({
      where: { userId },
      include: {
        artwork: {
          include: {
            author: true,
            country: {
              include: {
                translations: {
                  where: { language },
                },
              },
            },
          },
        },
      },
    });

    // Aggregate data
    const artistMap = new Map<string, number>();
    const countryMap = new Map<string, number>();

    for (const item of collectionItems) {
      if (item.customCountry === null) {
        // Artworks WITHOUT customCountry → go to artistsInCollection
        // Includes: linked artworks (item.artwork) AND custom artworks without country
        const artistName = item.artwork?.author.name || item.customAuthor;
        if (artistName) {
          artistMap.set(artistName, (artistMap.get(artistName) || 0) + 1);
        }
      } else {
        // Artworks WITH customCountry → go to countriesInCollection
        // Only custom artworks (monuments)
        countryMap.set(
          item.customCountry,
          (countryMap.get(item.customCountry) || 0) + 1,
        );
      }
    }

    // Convert maps to arrays and sort by count (descending)
    const artistsInCollection: ArtistInCollection[] = Array.from(
      artistMap.entries(),
    )
      .map(([artist, artworkCount]) => ({ artist, artworkCount }))
      .sort((a, b) => b.artworkCount - a.artworkCount);

    const countriesInCollection: CountryInCollection[] = Array.from(
      countryMap.entries(),
    )
      .map(([country, artworkCount]) => ({ country, artworkCount }))
      .sort((a, b) => b.artworkCount - a.artworkCount);

    return {
      stats: {
        totalArtworks: collectionItems.length,
        totalArtists: artistMap.size,
      },
      artistsInCollection,
      countriesInCollection,
    };
  }

  async getArtworksByArtist(
    userId: string,
    artistName: string,
    language: string = 'es',
  ) {
    // Fetch collection items filtered by artist name
    const collectionItems = await this.prisma.userCollectionItem.findMany({
      where: {
        userId,
        OR: [
          {
            artwork: {
              author: {
                name: artistName,
              },
            },
          },
          {
            customAuthor: artistName,
          },
        ],
      },
      include: {
        artwork: {
          include: {
            author: true,
            country: {
              include: {
                translations: {
                  where: { language },
                },
              },
            },
            category: {
              include: {
                translations: {
                  where: { language },
                },
              },
            },
            translations: {
              where: { language },
            },
          },
        },
        customCategory: {
          include: {
            translations: {
              where: { language },
            },
          },
        },
      },
      orderBy: {
        identifiedAt: 'desc',
      },
    });

    // Transform to match API response format
    const artworks = collectionItems.map((item) => {
      if (item.artwork) {
        // Linked artwork
        const translation = item.artwork.translations[0];
        const categoryTranslation = item.artwork.category.translations[0];
        const countryTranslation = item.artwork.country.translations[0];

        return {
          id: item.artwork.id,
          title: translation?.title || '',
          author: item.artwork.author.name,
          year: item.artwork.year,
          country: countryTranslation?.name || item.artwork.country.defaultName,
          period: categoryTranslation?.name || null,
          technique: translation?.technique,
          dimensions: item.artwork.dimensions,
          imageUrl: item.artwork.imageUrl,
          description: translation?.description || '',
          category: {
            id: item.artwork.category.id,
            name: categoryTranslation?.name || '',
            icon: item.artwork.category.icon,
          },
          createdAt: item.artwork.createdAt.toISOString(),
          updatedAt: item.artwork.updatedAt.toISOString(),
          capturedImageUrl: item.capturedImageUrl,
          identifiedAt: item.identifiedAt.toISOString(),
        };
      } else {
        // Custom/snapshot artwork
        const customCategoryTranslation = item.customCategory?.translations[0];

        return {
          id: item.id,
          title: item.customTitle || '',
          author: item.customAuthor || '',
          year: item.customYear,
          country: item.customCountry,
          period: customCategoryTranslation?.name || null,
          technique: item.customTechnique,
          dimensions: item.customDimensions,
          imageUrl: item.capturedImageUrl,
          description: item.customDescription || '',
          category: null,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
          capturedImageUrl: item.capturedImageUrl,
          identifiedAt: item.identifiedAt.toISOString(),
        };
      }
    });

    return {
      artist: artistName,
      artworkCount: artworks.length,
      artworks,
    };
  }

  async getArtworksByCountry(
    userId: string,
    countryName: string,
    language: string = 'es',
  ) {
    // Fetch collection items filtered by country name
    const collectionItems = await this.prisma.userCollectionItem.findMany({
      where: {
        userId,
        OR: [
          {
            artwork: {
              country: {
                defaultName: countryName,
              },
            },
          },
          {
            artwork: {
              country: {
                translations: {
                  some: {
                    name: countryName,
                  },
                },
              },
            },
          },
          {
            customCountry: countryName,
          },
        ],
      },
      include: {
        artwork: {
          include: {
            author: true,
            country: {
              include: {
                translations: {
                  where: { language },
                },
              },
            },
            category: {
              include: {
                translations: {
                  where: { language },
                },
              },
            },
            translations: {
              where: { language },
            },
          },
        },
        customCategory: {
          include: {
            translations: {
              where: { language },
            },
          },
        },
      },
      orderBy: {
        identifiedAt: 'desc',
      },
    });

    // Transform to match API response format
    const artworks = collectionItems.map((item) => {
      if (item.artwork) {
        // Linked artwork
        const translation = item.artwork.translations[0];
        const categoryTranslation = item.artwork.category.translations[0];
        const countryTranslation = item.artwork.country.translations[0];

        return {
          id: item.artwork.id,
          title: translation?.title || '',
          author: item.artwork.author.name,
          year: item.artwork.year,
          country: countryTranslation?.name || item.artwork.country.defaultName,
          period: categoryTranslation?.name || null,
          technique: translation?.technique,
          dimensions: item.artwork.dimensions,
          imageUrl: item.artwork.imageUrl,
          description: translation?.description || '',
          category: {
            id: item.artwork.category.id,
            name: categoryTranslation?.name || '',
            icon: item.artwork.category.icon,
          },
          createdAt: item.artwork.createdAt.toISOString(),
          updatedAt: item.artwork.updatedAt.toISOString(),
          capturedImageUrl: item.capturedImageUrl,
          identifiedAt: item.identifiedAt.toISOString(),
        };
      } else {
        // Custom/snapshot artwork
        const customCategoryTranslation = item.customCategory?.translations[0];

        return {
          id: item.id,
          title: item.customTitle || '',
          author: item.customAuthor || '',
          year: item.customYear,
          country: item.customCountry,
          period: customCategoryTranslation?.name || null,
          technique: item.customTechnique,
          dimensions: item.customDimensions,
          imageUrl: item.capturedImageUrl,
          description: item.customDescription || '',
          category: null,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
          capturedImageUrl: item.capturedImageUrl,
          identifiedAt: item.identifiedAt.toISOString(),
        };
      }
    });

    return {
      country: countryName,
      artworkCount: artworks.length,
      artworks,
    };
  }

  async getRecentArtworks(
    userId: string,
    limit: number = 3,
    language: string = 'es',
  ) {
    // Fetch recent collection items
    const collectionItems = await this.prisma.userCollectionItem.findMany({
      where: { userId },
      include: {
        artwork: {
          include: {
            author: true,
            country: {
              include: {
                translations: {
                  where: { language },
                },
              },
            },
            category: {
              include: {
                translations: {
                  where: { language },
                },
              },
            },
            translations: {
              where: { language },
            },
          },
        },
        customCategory: {
          include: {
            translations: {
              where: { language },
            },
          },
        },
      },
      orderBy: {
        identifiedAt: 'desc',
      },
      take: limit,
    });

    // Transform to simplified format as per API spec
    const artworks = collectionItems.map((item) => {
      if (item.artwork) {
        const translation = item.artwork.translations[0];
        return {
          id: item.artwork.id,
          title: translation?.title || '',
          author: item.artwork.author.name,
          capturedImageUrl: item.capturedImageUrl,
          identifiedAt: item.identifiedAt.toISOString(),
        };
      } else {
        // Custom/snapshot artwork
        return {
          id: item.id,
          title: item.customTitle || '',
          author: item.customAuthor || '',
          capturedImageUrl: item.capturedImageUrl,
          identifiedAt: item.identifiedAt.toISOString(),
        };
      }
    });

    return {
      artworks,
    };
  }

  async identifyArtwork(userId: string, dto: IdentifyArtworkDto) {
    // Try to find existing artwork by title and author
    const existingArtwork = await this.prisma.artwork.findFirst({
      where: {
        author: {
          name: dto.author,
        },
        translations: {
          some: {
            title: dto.title,
          },
        },
      },
      include: {
        author: true,
        country: {
          include: {
            translations: true,
          },
        },
        category: {
          include: {
            translations: true,
          },
        },
        translations: true,
      },
    });

    // Create collection item
    const collectionItem = await this.prisma.userCollectionItem.create({
      data: {
        userId,
        artworkId: existingArtwork?.id || null,
        capturedImageUrl: dto.capturedImageUrl,
        // If no existing artwork, store as custom
        customTitle: existingArtwork ? null : dto.title,
        customAuthor: existingArtwork ? null : dto.author,
        customYear: existingArtwork ? null : dto.year,
        customCategoryId: existingArtwork ? null : dto.category_id,
        customTechnique: existingArtwork ? null : dto.technique,
        customDimensions: existingArtwork ? null : dto.dimensions,
        customCountry: existingArtwork ? null : dto.country,
      },
      include: {
        artwork: {
          include: {
            author: true,
            country: {
              include: {
                translations: true,
              },
            },
            category: {
              include: {
                translations: true,
              },
            },
            translations: true,
          },
        },
      },
    });

    // Get updated stats
    const stats = await this.getCollectionStats(userId);

    // Format the artwork response
    let artworkResponse;
    if (collectionItem.artwork) {
      // Linked artwork - use first translation (could be improved to use language param)
      const translation = collectionItem.artwork.translations[0];
      const categoryTranslation =
        collectionItem.artwork.category.translations[0];
      const countryTranslation = collectionItem.artwork.country.translations[0];

      artworkResponse = {
        id: collectionItem.artwork.id,
        title: translation?.title || '',
        author: collectionItem.artwork.author.name,
        year: collectionItem.artwork.year,
        country:
          countryTranslation?.name ||
          collectionItem.artwork.country.defaultName,
        period: categoryTranslation?.name || null,
        technique: translation?.technique,
        dimensions: collectionItem.artwork.dimensions,
        imageUrl: collectionItem.artwork.imageUrl,
        description: translation?.description || '',
        category: collectionItem.artwork.category
          ? {
              id: collectionItem.artwork.category.id,
              name: categoryTranslation?.name || '',
              icon: collectionItem.artwork.category.icon,
            }
          : null,
        createdAt: collectionItem.artwork.createdAt.toISOString(),
        updatedAt: collectionItem.artwork.updatedAt.toISOString(),
        capturedImageUrl: collectionItem.capturedImageUrl,
        identifiedAt: collectionItem.identifiedAt.toISOString(),
      };
    } else {
      // Custom artwork
      artworkResponse = {
        id: collectionItem.id,
        title: collectionItem.customTitle || '',
        author: collectionItem.customAuthor || '',
        year: collectionItem.customYear,
        country: collectionItem.customCountry,
        period: null, // TODO: Will be derived from customCategory.translations.name
        technique: collectionItem.customTechnique,
        dimensions: collectionItem.customDimensions,
        imageUrl: collectionItem.capturedImageUrl,
        description: collectionItem.customDescription || '',
        category: null,
        createdAt: collectionItem.createdAt.toISOString(),
        updatedAt: collectionItem.updatedAt.toISOString(),
        capturedImageUrl: collectionItem.capturedImageUrl,
        identifiedAt: collectionItem.identifiedAt.toISOString(),
      };
    }

    return {
      success: true,
      artwork: artworkResponse,
      updatedStats: stats,
    };
  }

  async deleteCollectionItem(userId: string, itemId: string) {
    // Find the collection item to ensure it belongs to the user
    const collectionItem = await this.prisma.userCollectionItem.findFirst({
      where: {
        id: itemId,
        userId,
      },
    });

    if (!collectionItem) {
      throw new Error('Collection item not found or does not belong to user');
    }

    // Delete the collection item
    await this.prisma.userCollectionItem.delete({
      where: {
        id: itemId,
      },
    });

    // Get updated stats
    const updatedStats = await this.getCollectionStats(userId);

    return {
      success: true,
      message: 'Artwork removed from collection',
      deletedId: itemId,
      updatedStats,
    };
  }

  private async getCollectionStats(userId: string): Promise<CollectionStats> {
    const collectionItems = await this.prisma.userCollectionItem.findMany({
      where: { userId },
      include: {
        artwork: {
          include: {
            author: true,
          },
        },
      },
    });

    const artistSet = new Set<string>();
    for (const item of collectionItems) {
      const artistName = item.artwork?.author.name || item.customAuthor;
      if (artistName) {
        artistSet.add(artistName);
      }
    }

    return {
      totalArtworks: collectionItems.length,
      totalArtists: artistSet.size,
    };
  }
}
