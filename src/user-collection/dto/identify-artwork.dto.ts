import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class IdentifyArtworkDto {
  @IsNotEmpty()
  @IsUrl()
  capturedImageUrl: string;

  @IsNotEmpty()
  @IsString()
  country: string;

  @IsNotEmpty()
  @IsString()
  category_id: string;

  @IsNotEmpty()
  @IsString()
  subcategory_id: string;

  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsString()
  author: string;

  @IsNotEmpty()
  @IsUrl()
  image_url: string;

  @IsOptional()
  @IsString()
  year?: string;

  @IsOptional()
  @IsString()
  period?: string;

  @IsOptional()
  @IsString()
  dimensions?: string;

  @IsOptional()
  @IsString()
  technique?: string;
}
