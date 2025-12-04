import { IsEnum, IsOptional } from 'class-validator';

export class GetCategoriesQueryDto {
  @IsOptional()
  @IsEnum(['es', 'en'])
  language?: 'es' | 'en' = 'es';
}
