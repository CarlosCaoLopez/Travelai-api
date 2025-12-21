import { IsOptional, IsString, IsEnum, IsBoolean } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  displayName?: string | null;

  @IsOptional()
  @IsEnum(['es', 'en'], { message: "Language must be 'es' or 'en'" })
  preferredLanguage?: 'es' | 'en';

  @IsOptional()
  @IsBoolean()
  allowDataCollection?: boolean | null;
}
