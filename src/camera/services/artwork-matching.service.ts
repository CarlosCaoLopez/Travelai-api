import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ArtworkMatchingService {
  private readonly logger = new Logger(ArtworkMatchingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findMatchingArtwork(
    title: string,
    artist: string,
    language: string = 'es',
  ): Promise<any | null> {
    try {
      // Normalize search terms
      const normalizedTitle = title.toLowerCase().trim();
      const normalizedArtist = artist.toLowerCase().trim();

      this.logger.log(`Searching for: "${title}" by "${artist}" (${language})`);

      // Search in translations (title match)
      const artworkByTitle = await this.prisma.artwork.findFirst({
        where: {
          translations: {
            some: {
              language,
              title: {
                contains: normalizedTitle,
                mode: 'insensitive',
              },
            },
          },
          author: {
            name: {
              contains: normalizedArtist,
              mode: 'insensitive',
            },
          },
        },
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

      if (artworkByTitle) {
        this.logger.log(`Match found: ${artworkByTitle.id}`);
        return artworkByTitle;
      }

      this.logger.log('No match found in database');
      return null;
    } catch (error) {
      this.logger.error(`Error matching artwork: ${error.message}`);
      return null;
    }
  }
}
