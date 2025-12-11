export interface UserArtworkResponseDto {
  id: string;
  userId: string;
  artworkId: string | null;
  title: string;
  author: string;
  year: string | null;
  period: string | null;
  technique: string | null;
  dimensions: string | null;
  country: string | null;
  description: string | null;
  localUri: string | null;
  identifiedAt: string;
  createdAt: string;
  updatedAt: string;
}
