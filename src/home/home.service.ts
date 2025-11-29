import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { QuoteResponseDto } from './dto/quote-response.dto';

@Injectable()
export class HomeService {
  private readonly logger = new Logger(HomeService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getQuotes(language: string = 'es'): Promise<QuoteResponseDto[]> {
    this.logger.log(`Fetching quotes for language: ${language}`);

    try {
      // First, try to get quotes in the requested language
      const quotes = await this.prisma.artistQuote.findMany({
        include: {
          author: {
            select: {
              name: true,
            },
          },
          translations: {
            where: {
              language: language,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      // Map to response format
      const mappedQuotes = quotes
        .filter((quote) => quote.translations.length > 0)
        .map((quote) => ({
          id: quote.id,
          text: quote.translations[0].text,
          author: quote.author.name,
        }));

      // If no quotes found for requested language, try fallback to Spanish
      if (mappedQuotes.length === 0 && language !== 'es') {
        this.logger.log(
          `No quotes found for language ${language}, falling back to Spanish`,
        );
        return this.getQuotes('es');
      }

      this.logger.log(`Retrieved ${mappedQuotes.length} quotes`);
      return mappedQuotes;
    } catch (error) {
      this.logger.error(`Error fetching quotes: ${error.message}`);
      throw error;
    }
  }
}
