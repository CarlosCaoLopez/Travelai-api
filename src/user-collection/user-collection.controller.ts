import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/supabase-jwt.strategy';
import { UserCollectionService } from './user-collection.service';
import { IdentifyArtworkDto } from './dto/identify-artwork.dto';
import { ModerateThrottle } from '../common/decorators/throttle.decorator';

@Controller('api/user/collection')
@UseGuards(SupabaseAuthGuard)
@ModerateThrottle()
export class UserCollectionController {
  constructor(private readonly userCollectionService: UserCollectionService) {}

  @Get()
  async getCollectionSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query('language') language?: string,
  ) {
    return this.userCollectionService.getCollectionSummary(
      user.userId,
      language || 'es',
    );
  }

  @Get('artist/:artistName')
  async getArtworksByArtist(
    @CurrentUser() user: AuthenticatedUser,
    @Param('artistName') artistName: string,
    @Query('language') language?: string,
  ) {
    return this.userCollectionService.getArtworksByArtist(
      user.userId,
      decodeURIComponent(artistName),
      language || 'es',
    );
  }

  @Get('country/:countryName')
  async getArtworksByCountry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('countryName') countryName: string,
    @Query('language') language?: string,
  ) {
    return this.userCollectionService.getArtworksByCountry(
      user.userId,
      decodeURIComponent(countryName),
      language || 'es',
    );
  }

  @Get('recent')
  async getRecent(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
    @Query('language') language?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 3;
    return this.userCollectionService.getRecentArtworks(
      user.userId,
      parsedLimit,
      language || 'es',
    );
  }

  @Post('identify')
  async identifyArtwork(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: IdentifyArtworkDto,
  ) {
    return this.userCollectionService.identifyArtwork(user.userId, dto);
  }

  @Delete(':id')
  async deleteCollectionItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.userCollectionService.deleteCollectionItem(user.userId, id);
  }
}
