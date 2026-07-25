# Paid plans design (post–Stripe foundation)

Implement **after** marketplace Checkout + webhooks are live on qa/production.

## Goals

- Subscription tiers for consumers and/or businesses (e.g. Free / Pro / Business).
- Entitlements enforced server-side from D1, updated only by Stripe webhooks.
- Company Cloudflare + billing email ready before live charges.

## Proposed model

### D1 tables

```sql
CREATE TABLE plan_definitions (
  id TEXT PRIMARY KEY,           -- free | pro | business
  name TEXT NOT NULL,
  stripe_price_id TEXT,          -- null for free
  features_json TEXT NOT NULL,   -- JSON feature flags
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE user_subscriptions (
  user_id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  status TEXT NOT NULL,         -- active | past_due | canceled | trialing
  current_period_end TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### Stripe

- Products + Prices in Stripe Dashboard (test on qa, live on production).
- Checkout Session `mode=subscription` or Customer Portal for changes/cancel.
- Webhooks: `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed`.
- Never trust the client for plan upgrades.

### API sketch

- `GET /billing/plans` — public plan catalog
- `POST /billing/checkout-session` — authenticated; returns Stripe URL
- `POST /billing/portal-session` — Customer Portal
- `GET /billing/me` — current plan + entitlements
- Extend existing `POST /marketplace/webhook` or add `/billing/webhook` with shared signature verify

### App

- Profile / Biz Settings: “Upgrade” → open Checkout / Portal via `Linking` + `growl://billing/*` return URLs.
- Gate features with `entitlements` from `/billing/me` (not local flags alone).

### Digital goods note

Physical marketplace goods stay on Stripe Checkout. If Growl sells **digital** unlocks or IAP-style content later, use RevenueCat / StoreKit / Play Billing separately — do not mix with physical-goods Stripe for App Store compliance.

## Out of scope for first paid-plans PR

- Full pricing UI redesign
- Trials / coupons (can add via Stripe Coupons later)
- Migrating auth or DB off Cloudflare
