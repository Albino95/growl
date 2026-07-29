# Grow! Admin & Seller Portal

Web console for Trust & Safety / ops **and** a scoped **Seller** portal for business accounts.

## Requirements

- Node.js **18+** (`nvm use 20` recommended)
- Backend API with admin + business routes deployed and D1 migrations applied

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
| **Staff** | Platform admins (`admin_users`) | Local: `admin@growl.app` / `GrowlAdmin123!` |
| **Seller** | Business users (`users.is_business`) | Demo: `business@growl.app` / `GrowlDemo123!` |

Sellers land on `/seller` (KPIs, products, orders, reports, settings). They never see moderation, users, privacy, or audit routes.

Staff keep the existing ops shell. Business Accounts provision sellers who can use the **Seller** tab or the Grow! mobile app.

### Default API URLs

| Mode | Config | Data |
|------|--------|------|
| **Default local dev** | `.env.development` → production API | Real remote D1 |
| **Offline local stack** | `.env.local` from example | Demo seeds |

Sidebar shows **API:** host; amber warning when talking to `localhost`.

## Credentials setup

### Staff admin

```bash
cd backend
npm run migrate:local
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

## Seller portal routes

- `/seller` — KPI dashboard
- `/seller/products` — catalog CRUD
- `/seller/orders` — fulfillment (no platform refunds)
- `/seller/reports` — CSV exports (orders, products, sales)
- `/seller/settings` — store profile

## Deploy

```bash
cd admin/dashboard
npm run pages:deploy
```

## Related

- Backend admin API: `backend/src/routes/admin/`
- Backend business API: `backend/src/routes/business.ts`
- Mobile business shell: `frontend/src/screens/Business/`
