import { IsEnum, IsNotEmpty } from 'class-validator';

export class CreateSetupIntentDto {
  @IsNotEmpty()
  @IsEnum(['monthly', 'annual'])
  planId: 'monthly' | 'annual';
}
