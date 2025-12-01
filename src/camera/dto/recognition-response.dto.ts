import {
  IsBoolean,
  IsString,
  IsNumber,
  IsArray,
  IsUrl,
  IsUUID,
  IsISO8601,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ArtworkDto {
  @IsUUID()
  id: string;

  @IsString()
  title: string;

  @IsString()
  artist: string;

  @IsString()
  year: string;

  @IsString()
  period: string;

  @IsString()
  description: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  confidence: number;

  @IsArray()
  @IsString({ each: true })
  tags: string[];

  @IsUrl()
  capturedImageUrl: string;

  @IsISO8601()
  identifiedAt: string;
}

export class RecognitionResponseDto {
  @IsBoolean()
  success: boolean;

  @IsBoolean()
  identified: boolean;

  @ValidateNested()
  @Type(() => ArtworkDto)
  artwork: ArtworkDto | null;

  @IsBoolean()
  savedToCollection: boolean;

  @IsString()
  message: string;
}
