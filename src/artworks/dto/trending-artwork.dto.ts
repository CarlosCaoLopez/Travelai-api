import type { ArtworkResponseDto } from './artwork-response.dto';

export interface TrendingArtworkDto extends ArtworkResponseDto {
  photoCount: number;
}

export interface TrendingArtworksResponseDto {
  artworks: TrendingArtworkDto[];
  timeWindow: {
    hours: number;
    since: string;
  };
}
