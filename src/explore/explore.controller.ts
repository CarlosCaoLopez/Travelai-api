import { Controller, Get, Query, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ExploreService } from './explore.service';
import type { ArtworksListResponseDto } from './dto/artwork-response.dto';
import { GetNearbyLocationsQueryDto } from './dto/get-nearby-locations-query.dto';
import { NearbyLocationsResponseDto } from './dto/nearby-locations-response.dto';

@Controller('api/explore')
@ApiTags('Explore')
export class ExploreController {
  private readonly logger = new Logger(ExploreController.name);

  constructor(private readonly exploreService: ExploreService) {}

  @Get('artworks')
  async getArtworks(
    @Query('category_id') categoryId?: string,
    @Query('subcategory_id') subcategoryId?: string,
    @Query('country') country?: string,
    @Query('language') language: string = 'es',
    @Query('limit') limit: string = '20',
    @Query('offset') offset: string = '0',
  ): Promise<ArtworksListResponseDto> {
    this.logger.log(
      `GET /api/explore/artworks - category_id: ${categoryId}, subcategory_id: ${subcategoryId}, country: ${country}, language: ${language}, limit: ${limit}, offset: ${offset}`,
    );

    return this.exploreService.getArtworks({
      categoryId,
      subcategoryId,
      country,
      language,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });
  }

  @Get('locations/nearby')
  @ApiOperation({
    summary: 'Obtener lugares culturales cercanos',
    description:
      'Retorna una lista de lugares culturales (museos, galerías, monumentos) cercanos a las coordenadas proporcionadas, enriquecidos con descripciones culturales generadas por IA.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de lugares culturales cercanos',
    type: NearbyLocationsResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Parámetros inválidos (coordenadas fuera de rango)',
  })
  @ApiResponse({
    status: 500,
    description: 'Error interno del servidor',
  })
  async getNearbyLocations(
    @Query() query: GetNearbyLocationsQueryDto,
  ): Promise<NearbyLocationsResponseDto> {
    this.logger.log(
      `GET /api/explore/locations/nearby - lat: ${query.latitude}, lng: ${query.longitude}, maxDistance: ${query.maxDistance}, language: ${query.language}, limit: ${query.limit}`,
    );

    return this.exploreService.getNearbyLocations(query);
  }
}
