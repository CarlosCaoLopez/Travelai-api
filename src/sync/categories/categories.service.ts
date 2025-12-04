import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  CategoriesResponseDto,
  CategoryWithRelationsDto,
} from './dto/categories-response.dto';

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getCategories(language: string = 'es'): Promise<CategoriesResponseDto> {
    try {
      this.logger.log(`Fetching categories for language: ${language}`);

      // Fetch all categories with translations and relations
      const categories = await this.prisma.category.findMany({
        include: {
          translations: {
            where: {
              language: {
                in: [language, 'es'], // Always fetch requested language + Spanish fallback
              },
            },
          },
          parentRelations: {
            select: {
              parentId: true,
            },
          },
          childRelations: {
            select: {
              childId: true,
            },
          },
        },
        orderBy: {
          sortOrder: 'asc',
        },
      });

      // Transform categories to match API response format
      const transformedCategories: CategoryWithRelationsDto[] = categories.map(
        (category) => {
          // Get translation: prefer requested language, fallback to Spanish
          const translation =
            category.translations.find((t) => t.language === language) ||
            category.translations.find((t) => t.language === 'es');

          if (!translation) {
            this.logger.warn(
              `No translation found for category ${category.id} in languages [${language}, es]`,
            );
          }

          return {
            id: category.id,
            name: translation?.name || 'Unknown',
            type: category.type as 'category' | 'subcategory',
            icon: category.icon,
            imageUrl: category.imageUrl,
            sortOrder: category.sortOrder,
            parentIds: category.parentRelations.map((r) => r.parentId),
            childIds: category.childRelations.map((r) => r.childId),
            createdAt: category.createdAt.toISOString(),
            updatedAt: category.updatedAt.toISOString(),
          };
        },
      );

      // Find the most recent updatedAt timestamp
      const mostRecentUpdate =
        categories.length > 0
          ? categories.reduce(
              (latest, category) =>
                category.updatedAt > latest ? category.updatedAt : latest,
              categories[0].updatedAt,
            )
          : new Date();

      this.logger.log(`Successfully fetched ${categories.length} categories`);

      return {
        categories: transformedCategories,
        updatedAt: mostRecentUpdate.toISOString(),
      };
    } catch (error) {
      this.logger.error('Error fetching categories', error);
      throw error;
    }
  }
}
