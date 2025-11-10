import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreatePaymentIntentDto {
  @IsNotEmpty()
  @IsEnum(['travel_pass'], {
    message: 'planId must be travel_pass for payment intents',
  })
  planId: 'travel_pass';

  @IsOptional()
  @IsString()
  currency?: string = 'eur';
}
