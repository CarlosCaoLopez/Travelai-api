export class CategoryWithRelationsDto {
  id: string;
  name: string;
  type: 'category' | 'subcategory';
  icon: string | null;
  imageUrl: string | null;
  sortOrder: number;
  parentIds: string[];
  childIds: string[];
  createdAt: string;
  updatedAt: string;
}

export class CategoriesResponseDto {
  categories: CategoryWithRelationsDto[];
  updatedAt: string;
}
