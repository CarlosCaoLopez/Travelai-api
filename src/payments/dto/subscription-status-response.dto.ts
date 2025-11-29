export class SubscriptionStatusResponseDto {
  plan: 'monthly' | 'annual' | null;
  status: 'active' | 'expired' | 'canceled' | 'past_due' | 'none';
  expiryDate?: string; // ISO 8601
  isSubscribed: boolean;
}
