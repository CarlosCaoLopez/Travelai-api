import { Controller, Get, Param, Query, Logger } from '@nestjs/common';
import { ArtworksService } from './artworks.service';
import type { ArtworkDetailResponseDto } from './dto/artwork-response.dto';
import type { TrendingArtworksResponseDto } from './dto/trending-artwork.dto';

@Controller('api/artworks')
export class ArtworksController {
  private readonly logger = new Logger(ArtworksController.name);

  constructor(private readonly artworksService: ArtworksService) {}

  @Get('trending')
  async getTrendingArtworks(
    @Query('hours') hours: string = '24',
    @Query('limit') limit: string = '10',
    @Query('language') language: string = 'es',
  ): Promise<TrendingArtworksResponseDto> {
    this.logger.log(
      `GET /api/artworks/trending - hours: ${hours}, limit: ${limit}, language: ${language}`,
    );

    const hoursNum = parseInt(hours, 10) || 24;
    const limitNum = parseInt(limit, 10) || 10;

    return await this.artworksService.getMostPhotographedArtworks(
      hoursNum,
      limitNum,
      language,
    );
  }

  @Get('search')
  async searchArtworks(
    @Query('q') query: string,
    @Query('language') language: string = 'es',
    @Query('limit') limit: string = '20',
    @Query('offset') offset: string = '0',
  ) {
    this.logger.log(
      `GET /api/artworks/search - query: "${query}", language: ${language}`,
    );

    const limitNum = parseInt(limit, 10) || 20;
    const offsetNum = parseInt(offset, 10) || 0;

    return await this.artworksService.searchArtworks(
      query,
      language,
      limitNum,
      offsetNum,
    );
  }

  @Get(':id')
  async getArtworkById(
    @Param('id') id: string,
    @Query('language') language: string = 'es',
  ): Promise<ArtworkDetailResponseDto> {
    this.logger.log(`GET /api/artworks/${id} - language: ${language}`);

    const artwork = await this.artworksService.getArtworkById(id, language);

    return {
      artwork,
    };
  }
}
