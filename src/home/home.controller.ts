import { Controller, Get, Query, Logger } from '@nestjs/common';
import { HomeService } from './home.service';
import { GetQuotesQueryDto } from './dto/get-quotes-query.dto';
import type { QuotesResponseDto } from './dto/quote-response.dto';

@Controller('api/home')
export class HomeController {
  private readonly logger = new Logger(HomeController.name);

  constructor(private readonly homeService: HomeService) {}

  /**
   * Get artist quotes by language
   * @param query - Query parameters including language
   * @returns Array of quotes with translations
   */
  @Get('quotes')
  async getQuotes(@Query() query: GetQuotesQueryDto): Promise<QuotesResponseDto> {
    const language = query.language || 'es';
    this.logger.log(`GET /api/home/quotes - language: ${language}`);

    const quotes = await this.homeService.getQuotes(language);

    return {
      quotes,
    };
  }
}
