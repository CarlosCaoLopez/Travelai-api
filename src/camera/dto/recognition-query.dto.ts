import { IsOptional, IsString, Matches } from 'class-validator';

export class RecognitionQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2}$/, {
    message: 'language must be a valid ISO 639-1 code (e.g., es, en)',
  })
  language?: string = 'es';
}
