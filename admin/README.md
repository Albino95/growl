# Growl Admin Dashboard

Web admin panel for trust & safety, user management, and business account provisioning.

## Requirements

- Node.js **18+** (`nvm use 20` recommended)
- Backend API with admin routes deployed and D1 migrations applied

## Quick start (real production users)

Local `npm run dev` uses [`.env.development`](dashboard/.env.development), which points at the **production API** and **remote D1** (where real app signups live).

```bash
cd admin/dashboard
nvm use 20          # if needed
npm install
npm run dev         # http://localhost:5174
```

Log in with your **production admin** credentials. The Users page lists all rows from the remote `users` table.

### Default API URLs

| Mode | Config | Users you see |
|------|--------|----------------|
| **Default local dev** | `.env.development` → production API | Real app signups |
| **Offline local stack** | Copy `.env.local.example` → `.env.local` | Demo seeds only |

Check the sidebar **API:** label — an amber warning appears when connected to `localhost` (demo data only).

## Credentials

### Admin panel login

| Environment | Email | Password |
|-------------|-------|----------|
| Production (remote D1) | Set when you seed remote admin | Your chosen password |
| Local D1 only | `admin@growl.app` | `GrowlAdmin123!` |

Seed local admin:

```bash
cd backend
npm run migrate:local
npm run seed:admin:local
```

Seed production admin (one-time):

```bash
cd backend
npm run migrate
node scripts/seed-admin-user.js   # omit --local for remote
```

### Mobile app demo users (not admin)

Seeded via `npm run seed:core:local` / `demo:remote` — password `GrowlDemo123!`.

## Environment variables

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE_URL` | Backend API base, e.g. `https://growl-backend.albino-ndreu.workers.dev/api/v1` |

See [`dashboard/.env.example`](dashboard/.env.example).

## Verify real users in D1

```bash
cd backend
npx wrangler d1 execute growl-db --remote --command \
  "SELECT email, created_at FROM users ORDER BY created_at DESC LIMIT 20;"
```

Search a specific account:

```bash
npx wrangler d1 execute growl-db --remote --command \
  "SELECT id, email FROM users WHERE email LIKE '%albino%';"
```

## Deploy

```bash
cd admin/dashboard
npm run pages:deploy
```

Production build uses [`.env.production`](dashboard/.env.production).

## Related

- Backend admin API: `backend/src/routes/admin/`
- Business account provisioning: **Ops → Business Accounts**
