export class CancelSubscriptionResponseDto {
  success: boolean;
  subscription: {
    id: string;
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string; // ISO 8601
    planId: 'monthly' | 'annual';
  };
  message: string;
}
