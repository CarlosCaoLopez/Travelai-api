# Stripe Full Implementation - Plan de Acción Completo

**Fecha de inicio**: 2025-01-08
**Estimación**: 4 semanas
**Status**: 🚧 En Progreso

---

## 📊 Resumen Ejecutivo

### Estado Actual vs Requerido

| Componente        | Actual     | Requerido                        | Gap  |
| ----------------- | ---------- | -------------------------------- | ---- |
| Endpoints         | 1 parcial  | 3 completos                      | 75%  |
| Base de Datos     | ❌ Ninguna | PostgreSQL + Prisma              | 100% |
| Autenticación     | ❌ Ninguna | Supabase JWT                     | 100% |
| Webhooks          | 3 básicos  | 7 con lógica completa            | 60%  |
| Planes soportados | 0          | 3 (Travel Pass, Monthly, Annual) | 100% |

### Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                     React Native App                         │
│                  (Supabase Auth + Stripe)                    │
└─────────────────────┬───────────────────────────────────────┘
                      │ Bearer Token (JWT)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    NestJS Backend API                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Auth Module  │  │   Payments   │  │   Webhooks   │      │
│  │ (Supabase)   │  │    Module    │  │   Controller │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         │                  │                  ▲              │
│         └──────────────────┼──────────────────┘              │
│                            ▼                                 │
│                   ┌──────────────┐                           │
│                   │   Prisma     │                           │
│                   │   Service    │                           │
│                   └──────────────┘                           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────┐
              │  PostgreSQL DB   │
              │  (Independent)   │
              └──────────────────┘

                         ▲
                         │ Webhooks
              ┌──────────┴─────────┐
              │    Stripe API       │
              └────────────────────┘
```

---

## 🎯 FASE 1: Infraestructura Base (Semana 1)

### ✅ Día 1-2: Setup de Base de Datos PostgreSQL

#### Tareas

- [x] Instalar Prisma y dependencias
- [x] Crear schema.prisma con modelo Subscription
- [x] Setup PostgreSQL con Docker
- [x] Configurar DATABASE_URL en .env
- [x] Ejecutar migración inicial
- [x] Crear PrismaService
- [x] Crear DatabaseModule
- [x] Probar conexión a DB

#### Archivos a Crear

```
prisma/
  └── schema.prisma
  └── migrations/
      └── 20250108_init/
          └── migration.sql

src/database/
  ├── database.module.ts
  └── prisma.service.ts
```

#### Schema de Prisma

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum PlanType {
  travel_pass
  monthly
  annual
}

enum SubscriptionStatus {
  active
  canceled
  past_due
  incomplete
  expired
}

model Subscription {
  id                    String              @id @default(uuid())
  userId                String              @map("user_id")
  stripeCustomerId      String              @map("stripe_customer_id")
  stripeSubscriptionId  String?             @unique @map("stripe_subscription_id")
  stripePaymentIntentId String?             @map("stripe_payment_intent_id")
  planId                PlanType            @map("plan_id")
  status                SubscriptionStatus  @default(incomplete)
  currentPeriodStart    DateTime?           @map("current_period_start")
  currentPeriodEnd      DateTime?           @map("current_period_end")
  createdAt             DateTime            @default(now()) @map("created_at")
  updatedAt             DateTime            @updatedAt @map("updated_at")

  @@unique([userId, planId])
  @@index([userId])
  @@index([stripeCustomerId])
  @@index([status])
  @@map("subscriptions")
}
```

#### Comandos

```bash
# Instalar dependencias
pnpm add @prisma/client
pnpm add -D prisma

# Inicializar Prisma
npx prisma init

# Crear migración
npx prisma migrate dev --name init

# Generar cliente
npx prisma generate
```

#### Variables de Entorno Nuevas

```env
# PostgreSQL Database (independent from Supabase)
DATABASE_URL="postgresql://postgres:password@localhost:5432/travelai_db?schema=public"
```

#### PrismaService Template

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

---

### ✅ Día 3-4: Autenticación con Supabase JWT

#### Tareas

- [ ] Instalar dependencias de autenticación
- [ ] Crear AuthModule
- [ ] Crear SupabaseJwtStrategy
- [ ] Crear SupabaseAuthGuard
- [ ] Crear decorator @CurrentUser()
- [ ] Configurar SUPABASE_JWT_SECRET en .env
- [ ] Proteger endpoint de prueba
- [ ] Testing de autenticación

#### Archivos a Crear

```
src/auth/
  ├── auth.module.ts
  ├── supabase-jwt.strategy.ts
  ├── supabase-auth.guard.ts
  └── current-user.decorator.ts
```

#### Dependencias a Instalar

```bash
pnpm add @nestjs/passport @nestjs/jwt passport-jwt
pnpm add -D @types/passport-jwt
```

#### Variables de Entorno

```env
# Supabase (only for JWT validation, NOT for database)
SUPABASE_JWT_SECRET=your-jwt-secret-from-supabase-dashboard
```

**Dónde obtener**: Supabase Dashboard → Settings → API → JWT Secret

#### SupabaseJwtStrategy Template

```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SupabaseJwtStrategy extends PassportStrategy(
  Strategy,
  'supabase-jwt',
) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('SUPABASE_JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    // Payload contiene: { sub: userId, email, ... }
    return { userId: payload.sub, email: payload.email };
  }
}
```

#### @CurrentUser() Decorator

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user; // { userId, email }
  },
);
```

---

### ✅ Día 5: Refactorización de Código Existente

#### Tareas

- [ ] Importar DatabaseModule en AppModule
- [ ] Importar AuthModule en AppModule
- [ ] Inyectar PrismaService en PaymentsModule
- [ ] Actualizar endpoint `/payments/payment-sheet` → `/api/payments/create-intent`
- [ ] Agregar @UseGuards(SupabaseAuthGuard) a PaymentsController
- [ ] Usar @CurrentUser() para obtener userId
- [ ] Validar planId === 'travel_pass'
- [ ] Implementar findOrCreateCustomer con DB lookup
- [ ] Build y testing

#### Cambios en AppModule

```typescript
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    StripeModule.forRootAsync({ ... }),
    PaymentsModule,
  ],
})
```

#### Cambios en PaymentsController

```typescript
import { UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('api/payments')
@UseGuards(SupabaseAuthGuard)
export class PaymentsController {
  @Post('create-intent')
  async createPaymentIntent(
    @CurrentUser() user: { userId: string; email: string },
    @Body() dto: CreatePaymentIntentDto,
  ) {
    // dto.planId debe ser 'travel_pass'
    return this.paymentsService.createPaymentIntent(user.userId, dto);
  }
}
```

---

## 🎯 FASE 2: Endpoints de Suscripciones (Semana 2)

### ✅ Día 6-7: Endpoint create-subscription

#### Tareas

- [ ] Crear CreateSubscriptionDto con validación
- [ ] Implementar validación de planId ('monthly' | 'annual')
- [ ] Agregar STRIPE_PRICE_MONTHLY y STRIPE_PRICE_ANNUAL a .env
- [ ] Crear mapeo planId → Price ID
- [ ] Implementar hasActiveSubscription() en service
- [ ] Implementar createSubscription() en service
- [ ] Crear endpoint POST /api/payments/create-subscription
- [ ] Testing con Stripe test mode

#### CreateSubscriptionDto

```typescript
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateSubscriptionDto {
  @IsEnum(['monthly', 'annual'], {
    message: 'planId must be either monthly or annual',
  })
  planId: 'monthly' | 'annual';

  @IsOptional()
  @IsString()
  currency?: string = 'eur';
}
```

#### Lógica en PaymentsService

```typescript
async createSubscription(userId: string, dto: CreateSubscriptionDto) {
  // 1. Verificar que no tenga suscripción activa del mismo plan
  const existing = await this.prisma.subscription.findFirst({
    where: {
      userId,
      planId: dto.planId,
      status: 'active',
      currentPeriodEnd: { gt: new Date() }
    }
  });

  if (existing) {
    throw new BadRequestException('Ya tienes una suscripción activa de este plan');
  }

  // 2. Obtener/crear Customer
  const customer = await this.findOrCreateCustomer(userId);

  // 3. Mapear planId a Price ID
  const priceId = this.getPriceId(dto.planId);

  // 4. Crear Subscription en Stripe
  const subscription = await this.stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: priceId }],
    payment_behavior: 'default_incomplete',
    payment_settings: {
      save_default_payment_method: 'on_subscription',
    },
    expand: ['latest_invoice.payment_intent'],
    metadata: { userId, planId: dto.planId },
  });

  // 5. Extraer client_secret
  const invoice = subscription.latest_invoice as Stripe.Invoice;
  const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent;

  // 6. Guardar en DB con status 'incomplete'
  await this.prisma.subscription.create({
    data: {
      userId,
      stripeCustomerId: customer.id,
      stripeSubscriptionId: subscription.id,
      planId: dto.planId,
      status: 'incomplete',
    }
  });

  // 7. Crear Ephemeral Key
  const ephemeralKey = await this.stripe.ephemeralKeys.create(
    { customer: customer.id },
    { apiVersion: '2025-10-29.clover' }
  );

  // 8. Retornar
  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    customerId: customer.id,
    ephemeralKey: ephemeralKey.secret,
  };
}

private getPriceId(planId: 'monthly' | 'annual'): string {
  const priceIds = {
    monthly: this.configService.get<string>('STRIPE_PRICE_MONTHLY'),
    annual: this.configService.get<string>('STRIPE_PRICE_ANNUAL'),
  };
  return priceIds[planId];
}
```

#### Variables de Entorno

```env
# Stripe Price IDs (copiar del Dashboard después de crear productos)
STRIPE_PRICE_MONTHLY=price_xxxxxxxxxxxxx
STRIPE_PRICE_ANNUAL=price_xxxxxxxxxxxxx
```

---

### ✅ Día 8: Endpoint subscription/status

#### Tareas

- [ ] Crear SubscriptionStatusResponseDto
- [ ] Implementar getSubscriptionStatus() en service
- [ ] Crear endpoint GET /api/payments/subscription/status
- [ ] Lógica de verificación de expiración
- [ ] Testing de diferentes estados

#### SubscriptionStatusResponseDto

```typescript
export class SubscriptionStatusResponseDto {
  plan: 'travel_pass' | 'monthly' | 'annual' | null;
  status: 'active' | 'expired' | 'canceled' | 'past_due' | 'none';
  expiryDate?: string; // ISO 8601
  isSubscribed: boolean;
}
```

#### Lógica en PaymentsService

```typescript
async getSubscriptionStatus(userId: string): Promise<SubscriptionStatusResponseDto> {
  // Buscar suscripción más reciente y activa
  const subscription = await this.prisma.subscription.findFirst({
    where: {
      userId,
      OR: [
        { status: 'active' },
        { status: 'past_due' },
      ],
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (!subscription) {
    return {
      plan: null,
      status: 'none',
      isSubscribed: false,
    };
  }

  // Verificar si expiró
  const now = new Date();
  const isExpired = subscription.currentPeriodEnd && subscription.currentPeriodEnd < now;

  if (isExpired) {
    // Actualizar status en DB
    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'expired' },
    });

    return {
      plan: subscription.planId,
      status: 'expired',
      expiryDate: subscription.currentPeriodEnd?.toISOString(),
      isSubscribed: false,
    };
  }

  return {
    plan: subscription.planId,
    status: subscription.status,
    expiryDate: subscription.currentPeriodEnd?.toISOString(),
    isSubscribed: subscription.status === 'active',
  };
}
```

#### Endpoint en Controller

```typescript
@Get('subscription/status')
@UseGuards(SupabaseAuthGuard)
async getSubscriptionStatus(
  @CurrentUser() user: { userId: string },
): Promise<SubscriptionStatusResponseDto> {
  return this.paymentsService.getSubscriptionStatus(user.userId);
}
```

---

### ✅ Día 9-10: DTOs y Validación Global

#### Tareas

- [ ] Instalar class-validator y class-transformer
- [ ] Crear CreatePaymentIntentDto
- [ ] Actualizar CreatePaymentSheetDto existente
- [ ] Habilitar ValidationPipe global en main.ts
- [ ] Agregar validaciones a todos los DTOs
- [ ] Testing de validaciones
- [ ] Manejo de errores de validación

#### Dependencias

```bash
pnpm add class-validator class-transformer
```

#### ValidationPipe Global (main.ts)

```typescript
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Validación global
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ... resto del código
}
```

#### CreatePaymentIntentDto

```typescript
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class CreatePaymentIntentDto {
  @IsEnum(['travel_pass'], {
    message: 'planId must be travel_pass for payment intents',
  })
  planId: 'travel_pass';

  @IsOptional()
  @IsString()
  currency?: string = 'eur';
}
```

---

## 🎯 FASE 3: Webhooks y Lógica de Negocio (Semana 3)

### ✅ Día 11-13: Implementar 5 Webhook Handlers Nuevos

#### Tareas

- [ ] Handler: customer.subscription.created
- [ ] Handler: customer.subscription.updated
- [ ] Handler: customer.subscription.deleted
- [ ] Handler: invoice.paid
- [ ] Handler: invoice.payment_failed
- [ ] Actualizar WebhooksController con nuevos eventos
- [ ] Testing con Stripe CLI

#### customer.subscription.created

```typescript
private async handleSubscriptionCreated(subscription: Stripe.Subscription) {
  const userId = subscription.metadata.userId;
  const planId = subscription.metadata.planId as PlanType;

  await this.prisma.subscription.upsert({
    where: {
      userId_planId: { userId, planId },
    },
    create: {
      userId,
      stripeCustomerId: subscription.customer as string,
      stripeSubscriptionId: subscription.id,
      planId,
      status: subscription.status as SubscriptionStatus,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    },
    update: {
      stripeSubscriptionId: subscription.id,
      status: subscription.status as SubscriptionStatus,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    },
  });

  this.logger.log(`Subscription created/updated for user ${userId}, plan ${planId}`);
}
```

#### customer.subscription.updated

```typescript
private async handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  await this.prisma.subscription.update({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      status: subscription.status as SubscriptionStatus,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    },
  });

  this.logger.log(`Subscription ${subscription.id} updated to status ${subscription.status}`);
}
```

#### customer.subscription.deleted

```typescript
private async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  await this.prisma.subscription.update({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      status: 'canceled',
      // Mantener currentPeriodEnd para acceso residual
    },
  });

  this.logger.log(`Subscription ${subscription.id} canceled`);
}
```

#### invoice.paid

```typescript
private async handleInvoicePaid(invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription as string;

  if (!subscriptionId) return; // No es una subscription invoice

  await this.prisma.subscription.update({
    where: { stripeSubscriptionId: subscriptionId },
    data: {
      status: 'active',
      currentPeriodStart: new Date(invoice.period_start * 1000),
      currentPeriodEnd: new Date(invoice.period_end * 1000),
    },
  });

  this.logger.log(`Invoice ${invoice.id} paid, subscription ${subscriptionId} renewed`);
}
```

#### invoice.payment_failed

```typescript
private async handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription as string;

  if (!subscriptionId) return;

  await this.prisma.subscription.update({
    where: { stripeSubscriptionId: subscriptionId },
    data: {
      status: 'past_due',
    },
  });

  this.logger.error(`Invoice ${invoice.id} payment failed, subscription ${subscriptionId} past due`);
  // TODO: Enviar email al usuario
}
```

#### Actualizar handleWebhookEvent() en PaymentsService

```typescript
async handleWebhookEvent(event: Stripe.Event): Promise<void> {
  this.logger.log(`Processing webhook event: ${event.type}`);

  switch (event.type) {
    case 'payment_intent.succeeded':
      await this.handlePaymentSuccess(event.data.object as Stripe.PaymentIntent);
      break;

    case 'payment_intent.payment_failed':
      await this.handlePaymentFailure(event.data.object as Stripe.PaymentIntent);
      break;

    case 'payment_intent.canceled':
      await this.handlePaymentCanceled(event.data.object as Stripe.PaymentIntent);
      break;

    case 'customer.subscription.created':
      await this.handleSubscriptionCreated(event.data.object as Stripe.Subscription);
      break;

    case 'customer.subscription.updated':
      await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
      break;

    case 'customer.subscription.deleted':
      await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;

    case 'invoice.paid':
      await this.handleInvoicePaid(event.data.object as Stripe.Invoice);
      break;

    case 'invoice.payment_failed':
      await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      break;

    default:
      this.logger.log(`Unhandled event type: ${event.type}`);
  }
}
```

---

### ✅ Día 14: Mejorar payment_intent.succeeded

#### Tareas

- [ ] Implementar lógica para Travel Pass (7 días)
- [ ] Guardar en DB cuando es Travel Pass
- [ ] Diferenciar entre Travel Pass y Subscriptions
- [ ] Testing completo

#### Lógica Mejorada

```typescript
private async handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
  this.logger.log(`Payment succeeded: ${paymentIntent.id}`);
  this.logger.log(`Amount: ${paymentIntent.amount} ${paymentIntent.currency}`);

  const userId = paymentIntent.metadata?.userId;
  const planId = paymentIntent.metadata?.planId;

  if (!userId || !planId) {
    this.logger.warn(`Missing metadata in PaymentIntent ${paymentIntent.id}`);
    return;
  }

  // Solo procesar Travel Pass aquí (subscriptions se manejan vía invoice.paid)
  if (planId === 'travel_pass') {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 7); // +7 días

    await this.prisma.subscription.create({
      data: {
        userId,
        stripeCustomerId: paymentIntent.customer as string,
        stripePaymentIntentId: paymentIntent.id,
        planId: 'travel_pass',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: expiryDate,
      },
    });

    this.logger.log(`Travel Pass activated for user ${userId} until ${expiryDate.toISOString()}`);

    // TODO: Enviar email de confirmación (opcional)
  }
}
```

---

### ✅ Día 15: Testing de Webhooks

#### Tareas

- [ ] Instalar Stripe CLI
- [ ] Configurar webhook forwarding local
- [ ] Testing de cada evento individualmente
- [ ] Testing de flujos completos
- [ ] Verificar datos en DB
- [ ] Testing de idempotencia (eventos duplicados)

#### Comandos de Testing

```bash
# Iniciar forwarding de webhooks
stripe listen --forward-to localhost:3000/webhooks/stripe

# En otra terminal, simular eventos
stripe trigger payment_intent.succeeded
stripe trigger customer.subscription.created
stripe trigger invoice.paid
stripe trigger invoice.payment_failed
stripe trigger customer.subscription.deleted

# Verificar logs del backend
# Verificar datos en la DB con Prisma Studio
npx prisma studio
```

---

## 🎯 FASE 4: Testing y Producción (Semana 4)

### ✅ Día 16-18: Testing End-to-End

#### Tareas

- [ ] Test: Flujo completo Travel Pass
- [ ] Test: Flujo completo Monthly Subscription
- [ ] Test: Flujo completo Annual Subscription
- [ ] Test: Prevenir suscripción duplicada
- [ ] Test: Verificar status después de cada acción
- [ ] Test: Expiración de Travel Pass
- [ ] Test: Cancelación de suscripción
- [ ] Test: Fallo de pago con tarjeta declinada
- [ ] Test: Renovación automática (simular)

#### Escenarios de Testing

**Test 1: Travel Pass End-to-End**

```
1. Usuario hace login en app (obtiene JWT de Supabase)
2. App llama POST /api/payments/create-intent con Bearer token
   Body: { planId: "travel_pass" }
3. Backend retorna clientSecret
4. Usuario paga con tarjeta 4242 4242 4242 4242
5. Stripe procesa pago
6. Webhook payment_intent.succeeded llega al backend
7. Verificar en DB:
   - Subscription creada
   - status = 'active'
   - currentPeriodEnd = now + 7 días
8. App llama GET /api/payments/subscription/status
9. Verificar response:
   {
     plan: 'travel_pass',
     status: 'active',
     expiryDate: '2025-11-15T...',
     isSubscribed: true
   }
```

**Test 2: Monthly Subscription End-to-End**

```
1. Usuario hace login
2. App llama POST /api/payments/create-subscription
   Body: { planId: "monthly" }
3. Backend retorna clientSecret
4. Usuario paga
5. Webhooks llegan en orden:
   - customer.subscription.created
   - invoice.paid
   - payment_intent.succeeded
6. Verificar en DB:
   - Subscription creada
   - status = 'active'
   - stripeSubscriptionId presente
   - currentPeriodEnd = now + 1 mes
7. Verificar /subscription/status:
   {
     plan: 'monthly',
     status: 'active',
     expiryDate: '2025-12-08T...',
     isSubscribed: true
   }
```

**Test 3: Prevenir Duplicados**

```
1. Usuario ya tiene suscripción 'monthly' activa
2. Intenta crear otra suscripción 'monthly'
3. Backend debe retornar 400 Bad Request
4. Error message: "Ya tienes una suscripción activa de este plan"
```

**Test 4: Expiración de Travel Pass**

```
1. Crear Travel Pass con expiryDate en el pasado (manual en DB para testing)
2. Llamar GET /subscription/status
3. Verificar:
   - Backend actualiza status a 'expired'
   - Response: isSubscribed = false
```

---

### ✅ Día 19: Configuración de Stripe Dashboard

#### Tareas

- [ ] Crear cuenta Stripe (si no existe)
- [ ] Activar Test Mode
- [ ] Crear producto "Monthly Subscription"
- [ ] Crear producto "Annual Subscription"
- [ ] Copiar Price IDs a .env
- [ ] Configurar webhook endpoint (ngrok para testing)
- [ ] Seleccionar 7 eventos en webhook
- [ ] Copiar Webhook Signing Secret a .env
- [ ] Activar payment methods (Cards, Apple Pay, Google Pay)
- [ ] Testing con productos reales

#### Productos a Crear en Stripe Dashboard

**Producto 1: TravelAI Monthly Premium**

- **Nombre**: TravelAI Monthly Premium
- **Descripción**: Suscripción mensual con acceso completo a TravelAI
- **Precio**: €8.99
- **Tipo de precio**: Recurring
- **Intervalo de facturación**: Monthly
- **Metadatos**: `plan_id` = `monthly`

📋 **Copiar Price ID**: `price_xxxxxxxxxxxxx` → `.env` como `STRIPE_PRICE_MONTHLY`

**Producto 2: TravelAI Annual Premium**

- **Nombre**: TravelAI Annual Premium
- **Descripción**: Suscripción anual con acceso completo a TravelAI
- **Precio**: €59.99
- **Tipo de precio**: Recurring
- **Intervalo de facturación**: Yearly
- **Metadatos**: `plan_id` = `annual`

📋 **Copiar Price ID**: `price_xxxxxxxxxxxxx` → `.env` como `STRIPE_PRICE_ANNUAL`

#### Configuración de Webhook

**URL**: `https://your-ngrok-url.ngrok.io/webhooks/stripe`

**Eventos a seleccionar**:

- ✅ `payment_intent.succeeded`
- ✅ `payment_intent.payment_failed`
- ✅ `customer.subscription.created`
- ✅ `customer.subscription.updated`
- ✅ `customer.subscription.deleted`
- ✅ `invoice.paid`
- ✅ `invoice.payment_failed`

📋 **Copiar Signing Secret**: `whsec_xxxxxxxxxxxxx` → `.env` como `STRIPE_WEBHOOK_SECRET`

---

### ✅ Día 20: Documentación y Deploy

#### Tareas

- [ ] Actualizar README.md
- [ ] Crear guía de setup local
- [ ] Documentar variables de entorno
- [ ] Crear guía de testing
- [ ] Documentar endpoints de API
- [ ] Deploy a staging (Railway, Render, etc.)
- [ ] Configurar PostgreSQL en producción
- [ ] Ejecutar migraciones en producción
- [ ] Configurar webhook de producción
- [ ] Testing end-to-end en staging

#### Documentos a Crear

1. `docs/SETUP_GUIDE.md` - Guía de instalación local
2. `docs/API_ENDPOINTS.md` - Documentación de API
3. `docs/TESTING_GUIDE.md` - Cómo ejecutar tests
4. `docs/STRIPE_DASHBOARD_SETUP.md` - Configuración de Stripe
5. `docs/DEPLOYMENT.md` - Guía de deployment

---

## 📦 Resumen de Archivos

### Archivos a Crear (23 archivos nuevos)

#### Base de Datos (3)

1. `prisma/schema.prisma`
2. `src/database/database.module.ts`
3. `src/database/prisma.service.ts`

#### Autenticación (4)

4. `src/auth/auth.module.ts`
5. `src/auth/supabase-jwt.strategy.ts`
6. `src/auth/supabase-auth.guard.ts`
7. `src/auth/current-user.decorator.ts`

#### DTOs (3)

8. `src/payments/dto/create-payment-intent.dto.ts`
9. `src/payments/dto/create-subscription.dto.ts`
10. `src/payments/dto/subscription-status-response.dto.ts`

#### Testing (4)

11. `test/payments/create-intent.e2e-spec.ts`
12. `test/payments/create-subscription.e2e-spec.ts`
13. `test/payments/subscription-status.e2e-spec.ts`
14. `test/webhooks/webhooks.e2e-spec.ts`

#### Documentación (6)

15. `docs/SETUP_GUIDE.md`
16. `docs/API_ENDPOINTS.md`
17. `docs/TESTING_GUIDE.md`
18. `docs/STRIPE_DASHBOARD_SETUP.md`
19. `docs/DEPLOYMENT.md`
20. `docs/DATABASE_SCHEMA.md`

#### Configuración (3)

21. `.env` (completar desde .env.example)
22. `docker-compose.yml` (PostgreSQL local)
23. `.github/workflows/ci.yml` (opcional - CI/CD)

### Archivos a Modificar (9 archivos)

1. `package.json` - Nuevas dependencias
2. `.env.example` - Variables de entorno completas
3. `src/app.module.ts` - Importar DatabaseModule y AuthModule
4. `src/main.ts` - Habilitar ValidationPipe global
5. `src/payments/payments.module.ts` - Inyectar PrismaService
6. `src/payments/payments.service.ts` - Toda la lógica nueva (~800 líneas)
7. `src/payments/payments.controller.ts` - 3 endpoints protegidos
8. `src/payments/webhooks.controller.ts` - Sin cambios (solo service)
9. `README.md` - Actualizar con nueva información

---

## 📋 Dependencias a Instalar

```json
{
  "dependencies": {
    "@nestjs/config": "^4.0.2",
    "@nestjs/jwt": "^10.2.0",
    "@nestjs/passport": "^10.0.3",
    "@prisma/client": "^6.2.0",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "passport-jwt": "^4.0.1",
    "stripe": "^19.3.0"
  },
  "devDependencies": {
    "@types/passport-jwt": "^4.0.1",
    "prisma": "^6.2.0"
  }
}
```

---

## 🌍 Variables de Entorno Completas

### .env.example (actualizado)

```env
# Application
NODE_ENV=development
PORT=3000

# PostgreSQL Database (independent from Supabase)
DATABASE_URL="postgresql://postgres:password@localhost:5432/travelai_db?schema=public"

# Supabase (only for JWT authentication, NOT for database)
SUPABASE_JWT_SECRET=your-jwt-secret-from-supabase-dashboard

# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_51xxxxxxxxxxxxx
STRIPE_PUBLISHABLE_KEY=pk_test_51xxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx

# Stripe Price IDs (copy from Dashboard after creating products)
STRIPE_PRICE_MONTHLY=price_xxxxxxxxxxxxx
STRIPE_PRICE_ANNUAL=price_xxxxxxxxxxxxx
```

---

## 🚀 Setup PostgreSQL con Docker

### docker-compose.yml

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: travelai-postgres
    restart: always
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: travelai_db
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### Comandos

```bash
# Iniciar PostgreSQL
docker-compose up -d

# Ver logs
docker-compose logs -f postgres

# Detener
docker-compose down

# Detener y eliminar datos
docker-compose down -v
```

---

## 🎯 Progreso de Implementación

### Semana 1: Infraestructura ✅

- [x] Día 1-2: Setup PostgreSQL + Prisma
- [x] Día 3-4: Autenticación Supabase JWT
- [x] Día 5: Refactorización código existente

### Semana 2: Endpoints ✅

- [x] Día 6-7: create-subscription endpoint
- [x] Día 8: subscription/status endpoint
- [x] Día 9-10: DTOs y validación

### Semana 3: Webhooks ✅

- [x] Día 11-13: 5 webhook handlers nuevos
- [x] Día 14: Mejorar payment_intent.succeeded (integrado)
- [ ] Día 15: Testing webhooks

### Semana 4: Testing y Deploy

- [ ] Día 16-18: Testing E2E completo
- [ ] Día 19: Configurar Stripe Dashboard
- [ ] Día 20: Documentación y deploy

---

## 📌 Notas Importantes

1. **Idempotencia**: Stripe puede enviar el mismo webhook múltiples veces. Usar `upsert` o verificar antes de insertar.

2. **Timezone**: Siempre usar UTC. Stripe envía timestamps en Unix (segundos desde epoch).

3. **Metadata**: Siempre incluir `userId` y `planId` en metadata de PaymentIntents y Subscriptions.

4. **Seguridad**:
   - NUNCA exponer STRIPE_SECRET_KEY al frontend
   - Siempre validar JWT antes de crear pagos
   - Siempre verificar firma de webhooks

5. **Travel Pass vs Subscriptions**:
   - Travel Pass = PaymentIntent directo (€4.99 one-time)
   - Monthly/Annual = Subscription con Price ID

6. **Acceso Residual**: Cuando se cancela una suscripción, mantener acceso hasta `currentPeriodEnd`.

7. **Testing**: Usar Stripe CLI para simular webhooks localmente. No depender solo de pagos reales.

---

## 🆘 Troubleshooting

### Problema: "JWT malformed" al hacer request

**Solución**: Verificar que el token se envíe como `Authorization: Bearer <token>`

### Problema: Webhook signature verification fails

**Solución**: Verificar que STRIPE_WEBHOOK_SECRET sea correcto y que rawBody esté configurado

### Problema: Duplicate subscription error

**Solución**: Verificar constraint único en DB `(userId, planId)` y validación en endpoint

### Problema: Subscription no se marca como active

**Solución**: Verificar que webhook `invoice.paid` se esté recibiendo y procesando

---

---

## 📝 Cambios Implementados (Actualización: 2025-11-08)

### ✅ Fase 1-2 Completada: Infraestructura + Endpoints

#### Módulos Creados:
1. **AuthModule** - Autenticación con Supabase JWT
   - [SupabaseJwtStrategy](../src/auth/supabase-jwt.strategy.ts)
   - [SupabaseAuthGuard](../src/auth/supabase-auth.guard.ts)
   - [@CurrentUser decorator](../src/auth/current-user.decorator.ts)

2. **DTOs de Validación**:
   - [CreatePaymentIntentDto](../src/payments/dto/create-payment-intent.dto.ts) - Travel Pass
   - [CreateSubscriptionDto](../src/payments/dto/create-subscription.dto.ts) - Monthly/Annual
   - [SubscriptionStatusResponseDto](../src/payments/dto/subscription-status-response.dto.ts)

3. **Nuevos Endpoints en PaymentsController**:
   - `POST /api/payments/create-intent` - Travel Pass (€4.99)
   - `POST /api/payments/create-subscription` - Monthly/Annual
   - `GET /api/payments/subscription/status` - Status del usuario

4. **PaymentsService - Métodos Implementados**:
   - `createPaymentIntent()` - Crear PaymentIntent para Travel Pass
   - `createSubscription()` - Crear suscripción Stripe
   - `getSubscriptionStatus()` - Obtener status con verificación de expiración
   - `findOrCreateCustomer()` - Helper para gestión de customers
   - `getPriceId()` - Mapeo de planId a Stripe Price ID

5. **Webhook Handlers Completos**:
   - `handleSubscriptionCreated()` - customer.subscription.created
   - `handleSubscriptionUpdated()` - customer.subscription.updated
   - `handleSubscriptionDeleted()` - customer.subscription.deleted
   - `handleInvoicePaid()` - invoice.paid
   - `handleInvoicePaymentFailed()` - invoice.payment_failed

6. **Configuración Global**:
   - ValidationPipe habilitado en [main.ts](../src/main.ts)
   - AuthModule importado en [AppModule](../src/app.module.ts)
   - PrismaService inyectado en PaymentsService

#### Dependencias Instaladas:
- `@nestjs/passport`, `@nestjs/jwt`, `passport-jwt`, `@types/passport-jwt`
- `class-validator`, `class-transformer`

#### Próximos Pasos:
1. **Testing con Stripe CLI** - Simular webhooks localmente
2. **Configurar productos en Stripe Dashboard** - Obtener Price IDs
3. **Testing E2E** - Flujos completos de pago
4. **Documentación de API**

---

**Última actualización**: 2025-11-08
**Responsable**: Claude AI Assistant
**Status**: ✅ Fase 1-2 Completada | 🚧 Pendiente: Testing & Deploy
