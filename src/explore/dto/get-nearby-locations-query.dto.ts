import {
  IsNumber,
  IsOptional,
  Min,
  Max,
  IsString,
  Matches,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class GetNearbyLocationsQueryDto {
  @ApiProperty({
    description: 'Latitud del usuario',
    example: 40.4168,
    minimum: -90,
    maximum: 90,
  })
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  latitude: number;

  @ApiProperty({
    description: 'Longitud del usuario',
    example: -3.7038,
    minimum: -180,
    maximum: 180,
  })
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  longitude: number;

  @ApiProperty({
    description: 'Distancia máxima en metros',
    example: 5000,
    required: false,
    default: 5000,
    minimum: 100,
    maximum: 50000,
  })
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(50000)
  @Type(() => Number)
  maxDistance?: number = 5000;

  @ApiProperty({
    description: 'Código de idioma ISO 639-1',
    example: 'es',
    required: false,
    default: 'es',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2}$/, {
    message: 'language must be a valid ISO 639-1 code (e.g., es, en)',
  })
  language?: string = 'es';

  @ApiProperty({
    description: 'Número máximo de resultados',
    example: 10,
    required: false,
    default: 10,
    minimum: 1,
    maximum: 50,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  limit?: number = 10;
}
