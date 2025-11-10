import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class CreateSubscriptionWithPaymentMethodDto {
  @IsNotEmpty()
  @IsEnum(['monthly', 'annual'])
  planId: 'monthly' | 'annual';

  @IsOptional()
  @IsString()
  @Matches(/^seti_[a-zA-Z0-9_]+$/, {
    message: 'setupIntentId must be a valid Stripe SetupIntent ID (seti_xxxxx)',
  })
  setupIntentId?: string; // Optional: seti_xxxxx - SetupIntent ID to extract payment method from
}
