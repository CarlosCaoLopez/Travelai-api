import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import Fuse from 'fuse.js';

interface ArtworkCandidate {
  id: string;
  title: string;
  artistName: string;
  artwork: any;
}

@Injectable()
export class ArtworkMatchingService {
  private readonly logger = new Logger(ArtworkMatchingService.name);
  private readonly minSimilarityThreshold: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    // Default to 0.90 (90%) if not configured
    this.minSimilarityThreshold =
      this.configService.get<number>('ARTWORK_MATCH_MIN_SIMILARITY') || 0.9;
  }

  async findMatchingArtwork(
    title: string,
    artist: string,
    language: string = 'es',
  ): Promise<any | null> {
    try {
      this.logger.log(`Searching for: "${title}" by "${artist}" (${language})`);

      // Step 1: Get all artworks with their translations in the specified language
      const allArtworks = await this.prisma.artwork.findMany({
        include: {
          author: { select: { name: true } },
          country: {
            include: {
              translations: { where: { language } },
            },
          },
          category: {
            include: {
              translations: { where: { language } },
            },
          },
          translations: { where: { language } },
        },
      });

      // Step 2: Prepare candidates for fuzzy matching
      const candidates: ArtworkCandidate[] = [];
      for (const artwork of allArtworks) {
        const translation = artwork.translations[0];
        if (translation) {
          candidates.push({
            id: artwork.id,
            title: this.normalizeString(translation.title),
            artistName: this.normalizeString(artwork.author.name),
            artwork: artwork,
          });
        }
      }

      if (candidates.length === 0) {
        this.logger.log('No artworks found in database');
        return null;
      }

      // Step 3: Configure Fuse.js for fuzzy matching
      const normalizedTitle = this.normalizeString(title);
      const normalizedArtist = this.normalizeString(artist);

      // Configure Fuse for title matching
      const titleFuse = new Fuse(candidates, {
        keys: ['title'],
        threshold: 1 - this.minSimilarityThreshold, // Fuse uses distance (lower = better), we use similarity (higher = better)
        includeScore: true,
        ignoreLocation: true,
        findAllMatches: true,
      });

      // Step 4: Search for title matches
      const titleMatches = titleFuse.search(normalizedTitle);

      if (titleMatches.length === 0) {
        this.logger.log(
          'No title matches found with required similarity threshold',
        );
        return null;
      }

      // Step 5: Filter title matches by artist similarity
      const artistFuse = new Fuse(
        titleMatches.map((m) => m.item),
        {
          keys: ['artistName'],
          threshold: 1 - this.minSimilarityThreshold,
          includeScore: true,
          ignoreLocation: true,
          findAllMatches: true,
        },
      );

      const finalMatches = artistFuse.search(normalizedArtist);

      if (finalMatches.length === 0) {
        this.logger.log(
          'Title matches found, but none matched artist with required similarity',
        );
        return null;
      }

      // Step 6: Get the best match (lowest score = highest similarity)
      const bestMatch = finalMatches[0];
      const titleSimilarity =
        1 -
        (titleMatches.find((m) => m.item.id === bestMatch.item.id)?.score || 1);
      const artistSimilarity = 1 - (bestMatch.score || 1);

      this.logger.log(
        `Match found: "${bestMatch.item.title}" by "${bestMatch.item.artistName}" ` +
          `(Title: ${(titleSimilarity * 100).toFixed(1)}%, Artist: ${(artistSimilarity * 100).toFixed(1)}%)`,
      );

      return bestMatch.item.artwork;
    } catch (error) {
      this.logger.error(`Error matching artwork: ${error.message}`);
      return null;
    }
  }

  /**
   * Normalizes a string for better matching:
   * - Converts to lowercase
   * - Removes articles (the, la, le, el, los, las, les)
   * - Removes accents/diacritics
   * - Trims whitespace
   */
  private normalizeString(str: string): string {
    if (!str) return '';

    return (
      str
        .toLowerCase()
        .trim()
        // Remove articles at the beginning
        .replace(/^(the|la|le|el|los|las|les|un|une|una)\s+/i, '')
        // Remove accents/diacritics
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        // Remove extra whitespace
        .replace(/\s+/g, ' ')
        .trim()
    );
  }
}
