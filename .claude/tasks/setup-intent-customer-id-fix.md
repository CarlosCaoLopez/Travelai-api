# Fix SetupIntent Flow - Accept CustomerId Instead of PaymentMethodId

## Problem Statement

When using Stripe Payment Sheet with SetupIntent in React Native, the payment method is automatically attached to the customer as the default payment method after the user completes the flow. However, the frontend doesn't receive the `paymentMethodId` directly from the `confirmSetupIntent` result, causing the error:

```
Error: No payment method attached to SetupIntent
```

The current backend expects `paymentMethodId` in the request body, but this is not how Payment Sheet + SetupIntent works in practice.

## Root Cause

In the Payment Sheet + SetupIntent flow:
1. Frontend creates SetupIntent via `/api/payments/setup-intent`
2. User completes payment in Payment Sheet
3. Stripe automatically attaches the payment method to the customer **as the default payment method**
4. Frontend tries to get `paymentMethodId` from `confirmedSetupIntent.paymentMethod` but it may not be immediately available
5. Backend expects explicit `paymentMethodId` which the frontend can't reliably provide

## Solution Overview

Modify the backend to accept **either** `customerId` **or** `paymentMethodId` when creating a subscription. When only `customerId` is provided, the backend will:
1. Retrieve the customer's default payment method from Stripe
2. Use that payment method to create the subscription

This follows Stripe's recommended pattern for Payment Sheet + SetupIntent flows.

## Detailed Implementation Plan

### 1. Update DTO - Make `paymentMethodId` Optional

**File**: `src/payments/dto/create-subscription-with-payment-method.dto.ts`

**Changes**:
- Make `paymentMethodId` optional (remove `@IsNotEmpty()`)
- Add `@IsOptional()` decorator
- Update validation to ensure it matches pattern `pm_*` if provided

**Reasoning**: Allow frontend to omit `paymentMethodId` and let backend retrieve it from the customer's default payment method.

---

### 2. Update Service Logic - Handle Optional PaymentMethodId

**File**: `src/payments/dto/create-subscription-with-payment-method.dto.ts`

**Method**: `createSubscriptionWithPaymentMethod()`

**Changes**:

#### Step 1: Get or determine payment method
```typescript
// If paymentMethodId not provided, get default from customer
let paymentMethodId = dto.paymentMethodId;

if (!paymentMethodId) {
  // Retrieve customer from Stripe
  const customer = await this.stripe.customers.retrieve(
    customerStripeId
  ) as Stripe.Customer;

  // Get default payment method
  const defaultPaymentMethod = customer.invoice_settings?.default_payment_method;

  if (!defaultPaymentMethod) {
    throw new BadRequestException(
      'No se encontró método de pago predeterminado. Por favor, completa el proceso de pago primero.'
    );
  }

  paymentMethodId = typeof defaultPaymentMethod === 'string'
    ? defaultPaymentMethod
    : defaultPaymentMethod.id;
}
```

#### Step 2: Continue with existing validation
- Keep the existing validation that checks if payment method belongs to customer
- Use the `paymentMethodId` (either from request or from customer default) for creating subscription

**Reasoning**:
- Maintains backward compatibility (still accepts explicit `paymentMethodId`)
- Adds flexibility for Payment Sheet flow (uses customer's default if not provided)
- Maintains security by validating payment method belongs to customer

---

### 3. Update OpenAPI Specification

**File**: `openapi.yaml`

**Changes**:

#### Update `CreateSubscriptionWithPaymentMethodDto` schema
```yaml
CreateSubscriptionWithPaymentMethodDto:
  type: object
  required:
    - planId
    # Remove paymentMethodId from required
  properties:
    planId:
      type: string
      enum:
        - monthly
        - annual
      description: Identificador del plan de suscripción
      example: monthly
    paymentMethodId:
      type: string
      description: |
        (Opcional) ID del método de pago guardado desde el SetupIntent (comienza con 'pm_').
        Si no se proporciona, se usará el método de pago predeterminado del cliente.
      example: pm_1ABC123DEF456
      pattern: '^pm_[a-zA-Z0-9]+$'
```

#### Update endpoint description
Update `/api/payments/create-subscription-with-payment-method` description:
```yaml
description: |
  Crea una suscripción activa usando un método de pago previamente guardado mediante SetupIntent.
  Este es el **segundo paso** del flujo de suscripción de 2 pasos.

  **Requisitos previos:**
  1. Debes haber completado el flujo de SetupIntent llamando a `/api/payments/setup-intent`
  2. El cliente debe haber confirmado el SetupIntent usando Stripe SDK (Payment Sheet)

  **Dos formas de usar este endpoint:**

  **Opción A (Recomendado para Payment Sheet):**
  - Solo envía `planId` en el request body
  - El backend usará automáticamente el método de pago predeterminado del cliente
  - Más simple y sigue el patrón recomendado de Stripe

  **Opción B (Explícito):**
  - Envía tanto `planId` como `paymentMethodId`
  - Útil si el cliente tiene múltiples métodos de pago
  - El backend validará que el método de pago pertenezca al cliente
```

#### Add new example
```yaml
examples:
  monthlySubscriptionAutomatic:
    summary: Crear suscripción mensual (método de pago automático)
    value:
      planId: monthly
  monthlySubscriptionExplicit:
    summary: Crear suscripción mensual (método de pago explícito)
    value:
      planId: monthly
      paymentMethodId: pm_1ABC123DEF456
  annualSubscription:
    summary: Crear suscripción anual
    value:
      planId: annual
      paymentMethodId: pm_1XYZ789GHI012
```

---

### 4. Update Documentation

**File**: `SETUP_INTENT_FLOW.md`

**Changes**:

Update section "Flujo de Uso" to reflect the new simplified flow:

```markdown
### Para Suscripciones (Monthly/Annual) - FLUJO RECOMENDADO

1. Frontend: POST /api/payments/setup-intent
   Body: { planId: 'monthly' }
   ↓
2. Backend responde con SetupIntent client_secret
   ↓
3. Frontend inicializa Payment Sheet con setupIntentClientSecret
   await initPaymentSheet({
     setupIntentClientSecret: response.setupIntent,
     customerEphemeralKeySecret: response.ephemeralKey,
     customerId: response.customer,
     merchantDisplayName: 'TravelAI',
   })
   ↓
4. Usuario ingresa tarjeta en Payment Sheet y confirma
   ↓
5. Frontend presenta Payment Sheet
   const { error } = await presentPaymentSheet()
   ↓
6. Frontend: POST /api/payments/create-subscription-with-payment-method
   Body: { planId: 'monthly' }  // ⚠️ YA NO NECESITA paymentMethodId
   ↓
7. Backend obtiene el método de pago predeterminado del cliente automáticamente
   ↓
8. Backend crea suscripción y cobra inmediatamente
   ↓
9. Webhook invoice.paid activa la suscripción
```

Update "Ejemplo de Uso Frontend" section:

```typescript
const handleSubscribe = async () => {
  try {
    // 1. Crear SetupIntent
    const { setupIntent, ephemeralKey, customer } = await createSetupIntent('monthly');

    // 2. Inicializar Payment Sheet
    await initPaymentSheet({
      setupIntentClientSecret: setupIntent,
      customerEphemeralKeySecret: ephemeralKey,
      customerId: customer,
      merchantDisplayName: 'TravelAI',
    });

    // 3. Presentar Payment Sheet
    const { error } = await presentPaymentSheet();

    if (error) {
      console.error('Error:', error);
      return;
    }

    // 4. Crear suscripción (YA NO necesitamos obtener paymentMethodId)
    const subscription = await createSubscriptionWithPaymentMethod('monthly');

    console.log('Subscription created:', subscription);
  } catch (error) {
    console.error('Error in subscription flow:', error);
  }
};
```

```typescript
const createSubscriptionWithPaymentMethod = async (
  planId: 'monthly' | 'annual',
) => {
  const response = await fetch('/api/payments/create-subscription-with-payment-method', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ planId }), // Solo planId, sin paymentMethodId
  });

  return await response.json();
};
```

Add new section explaining both flows:

```markdown
## Dos Formas de Crear Suscripción

### Forma 1: Automática (Recomendada para Payment Sheet)

**Request:**
```json
{
  "planId": "monthly"
}
```

**Comportamiento:**
- El backend obtiene automáticamente el método de pago predeterminado del cliente
- Más simple y menos propenso a errores
- Sigue el patrón recomendado de Stripe para Payment Sheet

### Forma 2: Explícita (Para casos avanzados)

**Request:**
```json
{
  "planId": "monthly",
  "paymentMethodId": "pm_1ABC123DEF456"
}
```

**Comportamiento:**
- Usa un método de pago específico
- Útil cuando el cliente tiene múltiples métodos de pago
- El backend valida que el método pertenezca al cliente
```

---

## Implementation Steps

1. ✅ Create this plan document
2. **Update DTO** - Make `paymentMethodId` optional
3. **Update Service** - Add logic to retrieve default payment method when not provided
4. **Update OpenAPI** - Document the optional parameter and new flow
5. **Update SETUP_INTENT_FLOW.md** - Reflect simplified frontend flow
6. **Test locally** - Verify both flows work (with and without paymentMethodId)
7. **Update frontend** - Remove paymentMethodId from request body

## Testing Plan

### Test Cases

1. **Create subscription without paymentMethodId (new flow)**
   - Create SetupIntent
   - Complete Payment Sheet
   - Call create-subscription-with-payment-method with only `planId`
   - Verify subscription is created successfully

2. **Create subscription with explicit paymentMethodId (backward compatibility)**
   - Create SetupIntent
   - Complete Payment Sheet
   - Get paymentMethodId somehow
   - Call create-subscription-with-payment-method with `planId` and `paymentMethodId`
   - Verify subscription is created successfully

3. **Error case: No default payment method**
   - Try to create subscription without paymentMethodId for customer with no default payment method
   - Verify error message is clear

4. **Error case: Invalid paymentMethodId**
   - Try to create subscription with paymentMethodId that doesn't belong to customer
   - Verify existing validation still works

## Breaking Changes

**None!** This is backward compatible:
- Frontend can still send `paymentMethodId` if desired
- New frontends can omit it for simpler flow
- Existing API consumers won't break

## Security Considerations

- ✅ Still validates payment method belongs to customer
- ✅ Requires authentication (Supabase JWT)
- ✅ Checks for existing active subscriptions
- ✅ No new security risks introduced

## Benefits

1. **Simpler frontend code** - No need to extract paymentMethodId
2. **Follows Stripe best practices** - Uses default payment method pattern
3. **Backward compatible** - Existing flows continue to work
4. **More reliable** - Avoids the "No payment method attached" error
5. **Better UX** - Fewer points of failure in the payment flow

## Notes

- The Stripe Customer object has `invoice_settings.default_payment_method` that gets set automatically when Payment Sheet completes
- When creating a subscription, if we don't specify `default_payment_method`, Stripe uses the customer's default automatically
- We could simplify even further by removing `default_payment_method` from subscription creation entirely, but explicit is better for clarity
