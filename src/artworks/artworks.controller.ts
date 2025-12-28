import {
  Controller,
  Get,
  Param,
  Query,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { ArtworksService } from './artworks.service';
import type { ArtworkDetailResponseDto } from './dto/artwork-response.dto';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/supabase-jwt.strategy';
import {
  ModerateThrottle,
  RelaxedThrottle,
} from '../common/decorators/throttle.decorator';

@Controller('api/artworks')
export class ArtworksController {
  private readonly logger = new Logger(ArtworksController.name);

  constructor(private readonly artworksService: ArtworksService) {}

  @Get('search')
  @ModerateThrottle()
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

  @Get('daily-recommendation')
  @RelaxedThrottle()
  @UseGuards(SupabaseAuthGuard)
  async getDailyRecommendation(
    @CurrentUser() user: AuthenticatedUser,
    @Query('language') language: string = 'es',
  ): Promise<ArtworkDetailResponseDto> {
    this.logger.log(
      `GET /api/artworks/daily-recommendation - userId: ${user.userId}, language: ${language}`,
    );

    const artwork = await this.artworksService.getDailyRecommendation(
      user.userId,
      language,
    );

    return {
      artwork,
    };
  }

  @Get(':id')
  @RelaxedThrottle()
  async getArtworkById(
    @Param('id') id: string,
    @Query('language') language: string = 'es',
  ): Promise<ArtworkDetailResponseDto> {
    // 🌍 LOG LANGUAGE PARAMETER
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🌍 ENDPOINT /api/artworks/:id - LANGUAGE PARAMETER');
    console.log(`Artwork ID: ${id}`);
    console.log(`Language received: ${language}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    this.logger.log(`GET /api/artworks/${id} - language: ${language}`);

    const artwork = await this.artworksService.getArtworkById(id, language);

    return {
      artwork,
    };
  }
}
