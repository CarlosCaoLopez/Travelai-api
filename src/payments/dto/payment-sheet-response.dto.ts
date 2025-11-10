export class PaymentSheetResponseDto {
  paymentIntent: string; // Payment Intent client secret
  ephemeralKey: string; // Ephemeral Key secret
  customer: string; // Customer ID
  publishableKey: string; // Stripe publishable key
}
