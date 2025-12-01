export interface CategoryObjectDto {
  id: string;
  name: string;
  icon: string;
}

export interface ArtworkResponseDto {
  id: string;
  title: string;
  author: string;
  year: string | null;
  country: string;
  period: string | null;
  technique: string | null;
  dimensions: string | null;
  imageUrl: string;
  description: string;
  category: CategoryObjectDto;
  subcategory: CategoryObjectDto | null;
  createdAt: string;
  updatedAt: string;
}

export interface ArtworkDetailResponseDto {
  artwork: ArtworkResponseDto;
}
