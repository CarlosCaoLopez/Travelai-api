import { IsOptional, IsEnum, IsString } from 'class-validator';

export class DeviceMetadataDto {
  @IsOptional()
  @IsEnum(['ios', 'android'])
  platform?: 'ios' | 'android';

  @IsOptional()
  @IsString()
  app_version?: string;
}
