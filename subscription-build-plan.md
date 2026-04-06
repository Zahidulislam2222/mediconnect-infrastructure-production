# Subscription Feature — Build Plan

**Status:** PLANNING COMPLETE — waiting for user go-ahead
**Model:** Discount Pass (cash-pay only, no insurance)
**Decision Date:** 2026-04-06

---

## Build Order (10 Steps)

Each step is independent and committable. If session dies mid-work, the next agent picks up from the last completed step.

---

### Step 1: Shared Types & Constants

**Files:** `backend_v2/shared/subscription.ts` (NEW)

**What to build:**
- TypeScript types: SubscriptionPlan, SubscriptionStatus, DoctorTier, CreditTransaction, PayoutRecord
- Plan config: FREE / PLUS / PREMIUM with discountPercent, price, features
- Doctor tier config: NEW (80/20) / ESTABLISHED (85/15) / TOP (88/12)
- Constants: MAX_RATE_INCREASE_PER_QUARTER (10%), PAYOUT_HOLD_DAYS (7), FAMILY_MAX (4), FAMILY_CHANGES_PER_YEAR (2), FREE_GP_VISITS_PREMIUM (1)
- Zod validation schemas for subscription API requests
- Helper: `calculateDiscountedPrice(doctorRate, subscriptionTier)` — server-side only
- Helper: `isDoctorRateIncreaseAllowed(currentRate, newRate, lastChangeDate)` — 10% cap

**Loopholes addressed:** #2 (server-side discount), #4 (rate cap)

**Depends on:** Nothing
**Commit message:** `feat(subscription): add shared types, plan config, and discount helpers`

---

### Step 2: Terraform — New DynamoDB Tables

**Files:** `environments/prod/dynamodb_us.tf`, `environments/prod/dynamodb_eu.tf`

**What to build:**
- `mediconnect-subscriptions` table (PK: patientId) — both US + EU
- `mediconnect-doctor-payouts` table (PK: doctorId, SK: periodEnd#payoutId) — both US + EU
- Deletion protection enabled
- PITR enabled (point-in-time recovery)
- Tags: project=mediconnect, managed_by=terraform

**Also update:**
- `resource-registry.yaml` — add both new tables
- `verify_app_vs_iac.sh` — add new tables to DynamoDB check list

**Loopholes addressed:** None directly (infrastructure)

**Depends on:** Nothing (parallel with Step 1)
**Commit message:** `infra(subscription): add DynamoDB tables for subscriptions and payouts`

---

### Step 3: Stripe Setup — Products, Prices, Webhook Events

**Files:** `environments/prod/ssm_us.tf`, `environments/prod/ssm_eu.tf`

**What to build:**
- SSM parameters for Stripe subscription config:
  - `/mediconnect/prod/stripe/plus_price_id`
  - `/mediconnect/prod/stripe/premium_price_id`
  - `/mediconnect/prod/stripe/connect_webhook_secret`
- Document Stripe Dashboard setup (manual steps for user):
  - Create Product: "MediConnect Subscription"
  - Create 2 Prices: Plus ($19/month), Premium ($39/month)
  - Add webhook events: customer.subscription.created, .updated, .deleted, invoice.paid, invoice.payment_failed, charge.dispute.created, customer.subscription.trial_will_end

**Loopholes addressed:** #11 (webhook signatures via SSM-stored secrets)

**Depends on:** Nothing (parallel with Steps 1-2)
**Commit message:** `infra(subscription): add SSM parameters for Stripe subscription config`

---

### Step 4: Subscription Controller — Create, Cancel, Upgrade

**Files:** `backend_v2/booking-service/src/controllers/subscription.controller.ts` (NEW)

**What to build:**
- `POST /subscriptions/create` — create Stripe Customer + Subscription
  - Validate age >= 18 (loophole #14)
  - Check no existing active subscription
  - Create Stripe Customer if not exists
  - Create Stripe Subscription with `payment_behavior: 'default_incomplete'`
  - DO NOT write to DB — wait for webhook (loophole #3)
  - Return client_secret for payment confirmation
- `POST /subscriptions/cancel` — cancel at period end
  - Sets `cancel_at_period_end = true` (access continues until cycle end, loophole #7)
  - Sends pre-cancellation confirmation
- `POST /subscriptions/upgrade` — Plus → Premium
  - Stripe handles proration automatically
- `GET /subscriptions/status` — current plan, discount, cycle dates
  - Reads from DB, not JWT (loophole #10)
- `POST /subscriptions/family/add` — add family member (Premium only)
  - Require auth as primary account holder (loophole #12)
  - Validate max 4 members, max 2 changes/year (loophole #5)
  - Send SMS/email confirmation to invited member
- `POST /subscriptions/family/remove` — remove family member
- `GET /subscriptions/portal` — Stripe Customer Portal URL (card update, invoices)

**Auto-renewal compliance (loophole #6):**
- Store consent timestamp + terms version at creation
- Stripe sends renewal reminders (configure in Stripe Dashboard)

**Loopholes addressed:** #3, #5, #6, #7, #10, #12, #14

**Depends on:** Step 1 (types), Step 3 (SSM params)
**Commit message:** `feat(subscription): add subscription controller with create, cancel, upgrade, family management`

---

### Step 5: Webhook Handler — Subscription Events

**Files:** `backend_v2/booking-service/src/controllers/webhook.controller.ts` (MODIFY)

**What to build (add to existing webhook handler):**
- `customer.subscription.created` → Write to mediconnect-subscriptions (status: active, assign discount)
- `customer.subscription.updated` → Update status (active/past_due/cancelled), handle plan changes
- `customer.subscription.deleted` → Set status=cancelled, discountPercent=0
- `invoice.paid` → Reset free GP visits (Premium), log successful renewal
- `invoice.payment_failed` → Mark past_due, patient gets grace period (3 days), send notification
- `charge.dispute.created` → Freeze subscription immediately (loophole #9), log to audit
- Idempotency: store processed Stripe event IDs, reject duplicates (loophole #11)
- Webhook signature verification on all events (existing pattern)
- All events write to `mediconnect-audit-logs` (existing)

**Loopholes addressed:** #3, #8, #9, #11, #20, #21

**Depends on:** Step 4 (subscription controller)
**Commit message:** `feat(subscription): handle 7 Stripe subscription webhook events with idempotency`

---

### Step 6: Booking Flow — Discount at Appointment Time

**Files:** `backend_v2/booking-service/src/controllers/booking.controller.ts` (MODIFY)

**What to build:**
- Before creating PaymentIntent, check patient subscription:
  1. Read `mediconnect-subscriptions` by patientId (NOT from JWT — loophole #10)
  2. If active subscription: calculate discounted price server-side (loophole #2)
  3. If Premium + free GP visit remaining + doctor is GP: create appointment with $0 charge
  4. If subscription but doctor visit: create PaymentIntent with discounted amount
  5. If no subscription: existing flow unchanged (full price)
- Check family membership: if booker is a family member, read primary's subscription
- Add to appointment record: `discountApplied`, `originalPrice`, `discountedPrice`, `subscriptionId`
- Write audit log for every discounted booking

**Loopholes addressed:** #2, #10

**Depends on:** Step 5 (webhook populates subscription DB)
**Commit message:** `feat(subscription): apply discount at booking time with server-side calculation`

---

### Step 7: Doctor Tier & Rate Management

**Files:** `backend_v2/doctor-service/src/controllers/doctor.controller.ts` (MODIFY)

**What to build:**
- `PUT /doctors/:id/rate` — update hourly rate
  - Enforce 10% quarterly cap (loophole #4)
  - Store rate history: `rateHistory: [{ rate, effectiveDate, approvedBy }]`
  - Reject if >10% increase within 90 days
- `PUT /doctors/:id/tier` — admin-only: set doctor tier (NEW/ESTABLISHED/TOP)
- `GET /doctors/:id/earnings` — doctor sees their payout history
- Auto-promote: after 6 months + 4.5+ rating → auto-upgrade from NEW to ESTABLISHED
- Store `stripeConnectAccountId` on doctor record (for payouts)

**Loopholes addressed:** #4 (rate inflation)

**Depends on:** Step 1 (tier types)
**Commit message:** `feat(subscription): add doctor tier management and rate cap enforcement`

---

### Step 8: Doctor Payout System

**Files:** `backend_v2/booking-service/src/controllers/payout.controller.ts` (NEW)

**What to build:**
- Weekly payout calculation (runs via scheduled job or admin trigger):
  1. Query all completed appointments for the week
  2. Calculate doctor's cut: `discountedPrice × doctorPercentage`
  3. Apply 7-day hold: only pay for appointments completed 7+ days ago (loophole #8)
  4. Check for refunds/disputes: deduct from payout if any
  5. Write to `mediconnect-doctor-payouts` table
  6. Call `stripe.transfers.create()` to send money to doctor's Stripe Connect account
- `GET /payouts/history` — doctor views past payouts
- `GET /admin/payouts/pending` — admin reviews pending payouts
- `POST /admin/payouts/execute` — admin triggers weekly payout run

**Loopholes addressed:** #8 (refund arbitrage), #17 (phantom visit detection in payout review)

**Depends on:** Step 7 (doctor Stripe Connect accounts)
**Commit message:** `feat(subscription): add weekly doctor payout system via Stripe Connect`

---

### Step 9: Admin Dashboard & Monitoring

**Files:** `backend_v2/admin-service/routers/subscriptions.py` (NEW)

**What to build:**
- `GET /admin/subscriptions` — list all subscriptions with filters (status, plan, date)
- `GET /admin/subscriptions/metrics` — MRR, churn rate, active count, revenue per tier
- `GET /admin/subscriptions/:patientId` — single subscription detail
- `POST /admin/subscriptions/:patientId/freeze` — manual freeze (disputes)
- `GET /admin/doctors/rate-changes` — flagged rate increases for review
- `GET /admin/fraud/alerts` — suspicious patterns:
  - Same doctor-patient pair booking repeatedly (loophole #17)
  - Family members in different cities (loophole #5)
  - High chargeback patients (loophole #9)
  - Sybil attack detection: same device/IP multiple accounts (loophole #16)

**Loopholes addressed:** #5, #9, #16, #17, #24

**Depends on:** Steps 4-8 (data exists in DB)
**Commit message:** `feat(subscription): add admin subscription dashboard and fraud monitoring`

---

### Step 10: Tests & Verification

**Files:** `backend_v2/shared/__tests__/compliance/subscription-safety.test.ts` (NEW)

**What to test:**
- Discount calculation is server-side only (never from client input)
- Rate cap enforcement (reject >10% quarterly increase)
- Subscription status check reads from DB not JWT
- Family member limit (max 4, max 2 changes/year)
- Free GP visit only for GP doctors, not specialists
- Payout hold is exactly 7 days
- Webhook idempotency (same event ID processed only once)
- Expired subscription returns no discount
- Cancel at period end doesn't remove discount immediately
- Age check (reject under 18)
- All subscription operations write audit logs
- Auto-renewal consent timestamp stored

**Also run:**
- `bash verify_app_vs_iac.sh` — must show 0 FAIL after new tables added
- Existing tests still pass (no regressions)

**Loopholes addressed:** All 24 verified via tests

**Depends on:** All previous steps
**Commit message:** `test(subscription): add subscription safety tests covering all 24 loopholes`

---

## Dependency Graph

```
Step 1 (types) ──────────────────────┐
Step 2 (Terraform) ── parallel ──┐   │
Step 3 (SSM/Stripe) ── parallel ─┤   │
                                 │   │
Step 4 (subscription controller) ←───┘
  │
Step 5 (webhooks) ←──────────────┘
  │
Step 6 (booking discount) ←─────┘
  │
Step 7 (doctor tiers) ←── depends on Step 1
  │
Step 8 (payouts) ←── depends on Step 7
  │
Step 9 (admin) ←── depends on Steps 4-8
  │
Step 10 (tests) ←── depends on ALL
```

## Estimated Changes

| Metric | Count |
|--------|-------|
| New files | ~8 |
| Modified files | ~6 |
| New DynamoDB tables | 2 (× 2 regions = 4) |
| New SSM parameters | ~3 (× 2 regions = 6) |
| New webhook events | 7 |
| New API endpoints | ~12 |
| New test assertions | ~30+ |
| Existing code broken | 0 (additive only) |
