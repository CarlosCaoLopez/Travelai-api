export class CategoryWithRelationsDto {
  id: string;
  name: string;
  type: 'category';
  icon: string | null;
  imageUrl: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export class CategoriesResponseDto {
  categories: CategoryWithRelationsDto[];
  updatedAt: string;
}
