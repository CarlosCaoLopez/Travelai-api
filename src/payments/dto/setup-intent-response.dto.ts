export class SetupIntentResponseDto {
  setupIntent: string; // SetupIntent client_secret (starts with 'seti_')
  ephemeralKey: string; // Ephemeral Key secret
  customer: string; // Customer ID
  publishableKey: string; // Stripe publishable key
}
