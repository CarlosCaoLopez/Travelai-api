import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class ArtworkDetailsRequestDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  artist?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  year?: string;

  @IsUUID()
  @IsOptional()
  artworkId?: string;
}
