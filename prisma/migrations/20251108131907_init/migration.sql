-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('travel_pass', 'monthly', 'annual');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'canceled', 'past_due', 'incomplete', 'expired');

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "stripe_customer_id" TEXT NOT NULL,
    "stripe_subscription_id" TEXT,
    "stripe_payment_intent_id" TEXT,
    "plan_id" "PlanType" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'incomplete',
    "current_period_start" TIMESTAMP(3) NOT NULL,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "subscriptions_stripe_customer_id_idx" ON "subscriptions"("stripe_customer_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex (removed to enforce single active subscription per user)
-- CREATE UNIQUE INDEX "subscriptions_user_id_plan_id_key" ON "subscriptions"("user_id", "plan_id");

-- ====================================================================
-- FIX: Single Active Subscription Constraint + Auto-Expiration Trigger
-- ====================================================================

-- Create partial unique index - only ONE active subscription per user
-- This allows multiple historical/expired/canceled subscriptions but only one active
CREATE UNIQUE INDEX "unique_active_subscription_per_user"
ON "subscriptions"("user_id")
WHERE "status" = 'active';

