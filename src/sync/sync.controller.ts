import { Controller, Get, Query, Patch, Body, UseGuards } from '@nestjs/common';
import { CategoriesService } from './categories/categories.service';
import { GetCategoriesQueryDto } from './categories/dto/get-categories-query.dto';
import { CategoriesResponseDto } from './categories/dto/categories-response.dto';
import { UsersService } from './users/users.service';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/supabase-jwt.strategy';
import { UpdateUserDto } from './users/dto/update-user.dto';
import type { UserResponseDto } from './users/dto/user-response.dto';
import { UserArtworksService } from './user-artworks/user-artworks.service';
import { GetUserArtworksQueryDto } from './user-artworks/dto/get-user-artworks-query.dto';
import type { UserArtworkResponseDto } from './user-artworks/dto/user-artwork-response.dto';

@Controller('api/sync')
export class SyncController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly usersService: UsersService,
    private readonly userArtworksService: UserArtworksService,
  ) {}

  @Get('categories')
  async getCategories(
    @Query() query: GetCategoriesQueryDto,
  ): Promise<CategoriesResponseDto> {
    return this.categoriesService.getCategories(query.language || 'es');
  }

  @Get('users/me')
  @UseGuards(SupabaseAuthGuard)
  async getProfile(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserResponseDto> {
    return this.usersService.getUserProfile(user.userId);
  }

  @Patch('users/me')
  @UseGuards(SupabaseAuthGuard)
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.updateUserProfile(user.userId, updateUserDto);
  }

  @Get('user/artworks')
  @UseGuards(SupabaseAuthGuard)
  async getUserArtworks(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetUserArtworksQueryDto,
  ): Promise<UserArtworkResponseDto[]> {
    const updatedAfter = query.updatedAfter
      ? new Date(query.updatedAfter)
      : undefined;

    return this.userArtworksService.getUserArtworks(
      user.userId,
      query.language || 'es',
      updatedAfter,
    );
  }
}
