import {
  IsString,
  IsObject,
  IsOptional,
  IsEmail,
  IsUUID,
} from 'class-validator';

export class UserMetadata {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  language?: string;
}

export class UserRecord {
  @IsUUID()
  id: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsObject()
  raw_user_meta_data?: UserMetadata;

  @IsOptional()
  @IsString()
  created_at?: string;
}

export class SupabaseWebhookDto {
  @IsString()
  type: string;

  @IsString()
  table: string;

  @IsObject()
  record: UserRecord;

  @IsString()
  schema: string;

  @IsOptional()
  old_record?: unknown;
}
