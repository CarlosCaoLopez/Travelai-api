import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @IsNotEmpty()
  deviceId: string;

  @IsString()
  @IsEnum(['ios', 'android'])
  platform: 'ios' | 'android';
}
