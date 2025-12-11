import { IsEnum, IsOptional, IsISO8601 } from 'class-validator';

export class GetUserArtworksQueryDto {
  @IsOptional()
  @IsEnum(['es', 'en'])
  language?: 'es' | 'en' = 'es';

  @IsOptional()
  @IsISO8601()
  updatedAfter?: string;
}
