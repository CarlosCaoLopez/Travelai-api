export class SubscriptionStatusResponseDto {
  plan: 'travel_pass' | 'monthly' | 'annual' | null;
  status: 'active' | 'expired' | 'canceled' | 'past_due' | 'none';
  expiryDate?: string; // ISO 8601
  isSubscribed: boolean;
}
