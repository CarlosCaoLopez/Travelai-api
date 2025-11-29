import { IsOptional, IsString, Length } from 'class-validator';

export class GetQuotesQueryDto {
  @IsOptional()
  @IsString()
  @Length(2, 2, { message: 'Language must be a 2-character ISO 639-1 code' })
  language?: string = 'es';
}
