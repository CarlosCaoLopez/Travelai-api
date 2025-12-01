import { ApiProperty } from '@nestjs/swagger';

export class LocationDto {
  @ApiProperty({
    description: 'ID único del lugar (place_id de Google)',
    example: 'ChIJLU7jZCIhQg0R592M49SEhfc',
  })
  id: string;

  @ApiProperty({
    description: 'Nombre del lugar',
    example: 'Museo del Prado',
  })
  title: string;

  @ApiProperty({
    description: 'Descripción cultural generada por LLM',
    example:
      'El Museo del Prado alberga la mayor colección de pintura española del mundo, destacando Las Meninas de Velázquez y obras de Goya. Imprescindible para amantes del arte clásico. Tiempo recomendado: 2-3 horas.',
  })
  description: string;

  @ApiProperty({
    description: 'Categoría del lugar',
    example: 'Museo',
    enum: [
      'Museo',
      'Galería de Arte',
      'Atracción Turística',
      'Edificio Religioso',
      'Parque',
      'Punto de Interés',
    ],
  })
  category: string;

  @ApiProperty({
    description: 'Distancia desde el usuario en metros',
    example: 350,
  })
  distance: number;

  @ApiProperty({
    description: 'Tiempo estimado de caminata',
    example: '5 min a pie',
  })
  estimatedTime: string;
}

export class NearbyLocationsResponseDto {
  @ApiProperty({
    description: 'Lista de lugares culturales cercanos',
    type: [LocationDto],
  })
  locations: LocationDto[];

  @ApiProperty({
    description: 'Número total de lugares retornados',
    example: 8,
  })
  count: number;
}
