# Fix Single Subscription Constraint + Auto-Expiration Trigger

## Problem Statement

Currently, the TravelAI API allows users to have multiple active subscriptions simultaneously (travel_pass + monthly + annual). The unique constraint is per `(userId, planId)`, not just `userId`. Additionally, subscriptions are only marked as expired when the user manually calls the `/subscription/status` endpoint.

## Requirements

1. **Single Active Subscription**: Each user can only have ONE active subscription at a time, regardless of plan type
2. **Automatic Expiration**: Add PostgreSQL trigger to automatically update subscription status to 'expired' when `current_period_end` passes

## Current State Analysis

### Database Schema
- Unique constraint: `@@unique([userId, planId])` - allows multiple plans per user
- No automatic expiration mechanism
- Status transitions are manual or webhook-driven

### Service Logic Issues
- Line 241-254: Only checks for duplicate subscriptions of the SAME plan type
- Does not prevent user from having `travel_pass` + `monthly` simultaneously
- Manual expiration check in `getSubscriptionStatus()` (lines 437-446)

## Implementation Plan

### Phase 1: Database Changes

#### 1.1 Create Migration File
**File**: `prisma/migrations/YYYYMMDDHHMMSS_fix_single_subscription_constraint/migration.sql`

**Changes**:
1. Drop existing unique constraint on `(userId, planId)`
2. Create partial unique index to enforce "one active subscription per user"
3. Add PostgreSQL function to auto-expire subscriptions
4. Add trigger to call expiration function on SELECT/UPDATE

**Reasoning**:
- Partial unique index allows only ONE active subscription per user
- Can still have historical/canceled subscriptions (multiple rows)
- Trigger ensures automatic expiration without cron jobs
- Uses PostgreSQL's native trigger system for reliability

#### 1.2 Update Prisma Schema
**File**: `prisma/schema.prisma`

**Changes**:
- Remove `@@unique([userId, planId])`
- Add comment documenting partial index (managed via raw SQL)

**Reasoning**:
- Prisma doesn't fully support partial indexes in schema
- Document that constraint is managed via migration SQL

### Phase 2: Service Logic Updates

#### 2.1 Modify `createSubscriptionWithPaymentMethod()`
**File**: `src/payments/payments.service.ts` (lines 228-409)

**Changes**:
- Update existing subscription check (lines 241-254)
- Query for ANY active subscription (not just same plan)
- If active subscription exists → cancel old one before creating new
- Add transaction wrapper for atomicity

**Reasoning**:
- Enforces business rule at application level too (defense in depth)
- Cancels old subscription in Stripe before creating new
- Transaction ensures consistency

#### 2.2 Modify Webhook Handlers
**Changes needed**:
- `handleSubscriptionCreated()` (lines 527-560): Add check for existing active subscriptions
- `handleSubscriptionUpdated()` (lines 565-578): No changes needed
- `handleInvoicePaid()` (lines 598-615): Verify no other active subscriptions

**Reasoning**:
- Webhooks can arrive out of order
- Need to handle edge cases where Stripe creates conflicting subscriptions
- Last line of defense against multiple active subscriptions

### Phase 3: Testing Strategy

#### 3.1 Manual Testing
1. Create subscription for user (monthly)
2. Verify user cannot create another subscription (annual)
3. Wait for `current_period_end` to pass
4. Query subscription → should auto-expire
5. Create new subscription → should succeed

#### 3.2 Edge Cases
- User has expired subscription → can create new one ✓
- User has canceled subscription → can create new one ✓
- Webhook arrives late for old subscription → should be rejected
- User tries to create subscription while one is `past_due` → should be allowed (for retry)

## Detailed SQL Implementation

### Partial Unique Index
```sql
-- Allow only ONE active subscription per user at a time
-- But allow multiple historical/expired/canceled subscriptions
CREATE UNIQUE INDEX unique_active_subscription_per_user
ON subscriptions(user_id)
WHERE status = 'active';
```

### Auto-Expiration Trigger Function
```sql
-- Function to expire subscriptions when current_period_end has passed
CREATE OR REPLACE FUNCTION expire_subscriptions()
RETURNS TRIGGER AS $$
BEGIN
  -- Update expired subscriptions
  UPDATE subscriptions
  SET status = 'expired', updated_at = NOW()
  WHERE status IN ('active', 'past_due')
    AND current_period_end IS NOT NULL
    AND current_period_end < NOW()
    AND id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger fires BEFORE UPDATE or SELECT on subscriptions table
CREATE TRIGGER trigger_expire_subscriptions
BEFORE UPDATE ON subscriptions
FOR EACH ROW
EXECUTE FUNCTION expire_subscriptions();
```

**Note**: Trigger on SELECT is not possible in PostgreSQL. Alternative approaches:
1. Trigger on UPDATE only ✓ (chosen)
2. Use PostgreSQL materialized view with refresh
3. Use pg_cron extension for scheduled job (requires extension)

**Decision**: Use BEFORE UPDATE trigger + manual expiration check in `getSubscriptionStatus()` as safety net.

### Better Approach: View with Expiration Logic
```sql
-- Create view that automatically shows correct status
CREATE OR REPLACE VIEW active_subscriptions AS
SELECT
  id,
  user_id,
  stripe_customer_id,
  stripe_subscription_id,
  stripe_payment_intent_id,
  plan_id,
  CASE
    WHEN status IN ('active', 'past_due')
         AND current_period_end IS NOT NULL
         AND current_period_end < NOW()
    THEN 'expired'::subscription_status
    ELSE status
  END AS status,
  current_period_start,
  current_period_end,
  created_at,
  updated_at
FROM subscriptions;
```

**Decision**: Create view for reads, keep manual update for writes.

## Migration Strategy

### Backward Compatibility
1. New constraint is MORE restrictive → need to clean existing data
2. Check for users with multiple active subscriptions
3. Keep most recent, cancel others

### Pre-Migration Cleanup Script
```sql
-- Find users with multiple active subscriptions
WITH ranked_subscriptions AS (
  SELECT
    id,
    user_id,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) as rn
  FROM subscriptions
  WHERE status = 'active'
)
UPDATE subscriptions
SET status = 'canceled'
WHERE id IN (
  SELECT id FROM ranked_subscriptions WHERE rn > 1
);
```

## Rollback Plan

If issues arise:
1. Drop partial unique index: `DROP INDEX unique_active_subscription_per_user;`
2. Recreate old constraint: `ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_user_id_plan_id_key UNIQUE (user_id, plan_id);`
3. Drop trigger: `DROP TRIGGER trigger_expire_subscriptions ON subscriptions;`
4. Drop function: `DROP FUNCTION expire_subscriptions();`

## Timeline

1. **Create migration file** (10 min)
2. **Update Prisma schema** (5 min)
3. **Modify payments.service.ts** (20 min)
4. **Test manually** (15 min)
5. **Review and validate** (10 min)

**Total**: ~60 minutes

## Success Criteria

- ✅ User can only have one active subscription
- ✅ Expired subscriptions are automatically marked as expired
- ✅ Users can create new subscriptions after expiration
- ✅ Webhooks handle edge cases correctly
- ✅ No breaking changes to existing API endpoints
- ✅ All database constraints enforced

## Open Questions

1. **What happens if user has active `monthly` and tries to upgrade to `annual`?**
   - Should we cancel old subscription immediately?
   - Should we prorate the refund in Stripe?
   - **Decision**: Cancel old subscription, no prorating (simpler MVP)

2. **Should `past_due` subscriptions block new subscription creation?**
   - Allow user to create new subscription (fresh start)
   - Or force them to fix payment on existing subscription?
   - **Decision**: Allow past_due to be replaced (user experience priority)

3. **How to handle `travel_pass` (one-time) vs recurring subscriptions?**
   - Is `travel_pass` a "subscription" or just a one-time payment?
   - Should `travel_pass` block recurring subscriptions?
   - **Decision**: Treat `travel_pass` as subscription, enforce same rule

## Notes

- MVP approach: Keep it simple, one active subscription per user
- Future enhancement: Allow upgrade/downgrade flows with prorating
- Database trigger is preferred over cron jobs (simpler architecture)
