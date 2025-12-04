import { IsOptional, IsString, IsEnum, IsUrl } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  displayName?: string | null;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string | null;

  @IsOptional()
  @IsEnum(['es', 'en'], { message: "Language must be 'es' or 'en'" })
  preferredLanguage?: 'es' | 'en';
}
