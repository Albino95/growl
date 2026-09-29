# Grow! Admin & Seller Portal

Web console for Trust & Safety / ops **and** a scoped **Seller** portal for business accounts.

Brand shell: cream surfaces (`#F3EEE4` / `#FFFcf7`), emerald brand (`#059669`), coral energy accents for urgency (pending reports, low stock).

## Requirements

- Node.js **18+** (`nvm use 20` recommended)
- Backend API with admin + business routes deployed and D1 migrations applied (through `0017_moderation_soft_hide.sql` for Phase 0 soft-hide)

## Quick start

```bash
cd admin/dashboard
nvm use 20
npm install
npm run dev         # http://localhost:5174
```

### Login tabs

| Tab | Who | Credentials |
|-----|-----|-------------|
| **Staff** | Platform admins (`admin_users`) | Local/QA: `admin@growl.app` / `GrowlAdmin123!` |
| **Seller** | Business users (`users.is_business`) | Demo: `business@growl.app` / `GrowlDemo123!` |

Sellers land on `/seller` (KPIs, products, orders, reports, settings). They never see moderation, users, privacy, or audit routes.

Staff keep the ops shell. Business Accounts provision sellers who can use the **Seller** tab or the Grow! mobile app.

Staff MFA: optional until `ADMIN_MFA_REQUIRED=true`. When the API returns `must_enroll_mfa`, login succeeds and the UI routes to **MFA Settings**.

### Default API URLs

| Mode | Config | Data |
|------|--------|------|
| **Default local dev** | `.env.development` → production API | Real remote D1 |
| **QA / TestFlight ops** | set `VITE_API_BASE_URL` to QA Worker | QA D1 (review + demo seeds) |
| **Offline local stack** | `.env.local` from example | Demo seeds |

Sidebar shows **API:** host; amber warning when talking to `localhost`.

## Credentials setup

### Staff admin

```bash
cd backend
npm run migrate:local
npm run seed:admin:local
# QA:
npm run seed:admin:qa
# Local:
npm run seed:admin:local
```

Production (one-time):

```bash
cd backend
npm run migrate
node scripts/seed-admin-user.js
```

### Seller demo (local/QA)

Seeded via `npm run seed:core:local` / demo scripts — password `GrowlDemo123!`.

Do **not** delete `business@growl.app` / `demo-core-business` during QA.

## Environment

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE_URL` | Backend API base, e.g. `https://….workers.dev/api/v1` |

## Staff routes

| Path | Purpose |
|------|---------|
| `/` | Dashboard KPIs + report trend |
| `/moderation` | Report queue |
| `/moderation/:id` | Case decide (soft-hide / warn / suspend / ban) |
| `/users`, `/users/:id` | User search + enforcement |
| `/business/accounts` | Provision / manage sellers |
| `/business` | Platform orders |
| `/analytics` | Commerce analytics |
| `/privacy` | Privacy / deletion requests |
| `/appeals` | Appeal queue |
| `/audit` | Audit log (filters by `target_type` / `target_id`) |
| `/settings/mfa` | TOTP enroll + recovery codes |

## Seller portal routes

- `/seller` — KPI dashboard
- `/seller/products` — catalog CRUD
- `/seller/orders` — fulfillment (no platform refunds)
- `/seller/reports` — CSV exports (orders, products, sales)
- `/seller/settings` — store profile

## Phase 0 moderation behaviour

- **Soft-hide only** (`is_hidden` on posts/products) — decide never hard-deletes consumer content.
- Protected emails cannot be banned/hidden: `review@growl.app`, `demo@growl.app`, `instructor@growl.app`, `business@growl.app`.
- See [docs/ADMIN_PHASE0_DEPLOY.md](../docs/ADMIN_PHASE0_DEPLOY.md) for Apple-safe deploy order and smoke.

### Automated smoke (QA)

```bash
cd backend
npm run test:admin-phase0-smoke:qa
# If a prior run locked login (15m IP/email buckets):
SKIP_RATE_LIMIT=1 npm run test:admin-phase0-smoke:qa
```

## Deploy

```bash
cd admin/dashboard
npm run pages:deploy
```

Admin Pages can ship anytime; they do not change the App Store binary. Hold **production Worker** deploy while App Review is active unless Phase 0 checklist is green — see deploy doc.

## Related

- Deploy checklist: `docs/ADMIN_PHASE0_DEPLOY.md`
- Store / review accounts: `docs/STORE_SUBMISSION.md`
- Backend admin API: `backend/src/routes/admin/`
- Backend business API: `backend/src/routes/business.ts`
- Mobile business shell: `frontend/src/screens/Business/`
