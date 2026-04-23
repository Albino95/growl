# Growl — API and testing guide

This document describes how the **backend** and **mobile app** talk to the API, how to run automated checks, and what to verify manually.

---

## Development API base URL

Use this origin for day-to-day development against the deployed Cloudflare Worker:

```bash
API_BASE_URL=https://growl-backend.albino-ndreu.workers.dev/api/v1
```

The Expo app reads `extra.API_BASE_URL` from `frontend/app.config.ts` (with the same value as the default when `API_BASE_URL` is unset). The shared HTTP client is `frontend/src/services/api/http.ts`.

### Pointing the app at a different environment

```bash
cd frontend
API_BASE_URL=https://your-worker.example.workers.dev/api/v1 npx expo start
```

Always include the **`/api/v1`** path suffix; routes are relative to that base.

### Quick health check

```text
GET https://growl-backend.albino-ndreu.workers.dev/api/v1/health
```

Expect JSON with `success: true` and `data.database` / `data.kv` showing connectivity.

---

## Backend — unit tests (Vitest)

Requirements: **Node 18+** (Node **20+** recommended). Vitest/Vite may fail on Node 16 with crypto-related startup errors.

```bash
cd backend
npm test
```

These tests exercise route handlers and helpers under `backend/tests/` and `backend/src/**/*.test.ts`.

---

## Backend — integration smoke (`test-api.js`)

The script performs real HTTP calls (sign-up, sign-in, feed, marketplace, etc.).

### Against local Wrangler (`wrangler dev`, port **8787**)

Terminal A:

```bash
cd backend
npm run dev
```

Terminal B:

```bash
cd backend
npm run test:local
```

`test:local` sets `API_BASE_URL=http://localhost:8787/api/v1`. If nothing is listening on `8787`, you will see connection failures (often reported as status `0`).

### Against the deployed Worker

```bash
cd backend
API_BASE_URL=https://growl-backend.albino-ndreu.workers.dev/api/v1 npm run test:integration
```

Or any other base URL:

```bash
cd backend
API_BASE_URL=https://your-host/api/v1 npm run test:integration
```

---

## Backend — D1 migrations (remote)

After adding SQL files under `backend/migrations/`:

```bash
cd backend
npx wrangler login    # once per machine
npm run migrate       # applies to remote D1 named in wrangler.toml
```

Local-only Miniflare DB:

```bash
cd backend
npm run migrate:local
```

If local schema looks stale, see `NEXT_STEPS.md` for `npm run db:reset:local`.

---

## Frontend — typecheck and lint

```bash
cd frontend
npm run typecheck
npm run lint
```

There is no dedicated E2E suite in-repo yet; rely on the backend integration script plus manual flows below.

---

## Manual QA checklist (device or simulator)

- Auth: email/password and SSO if enabled.
- Feed: load, pull-to-refresh, like, open comments.
- Marketplace: list, product detail, cart/checkout path you support.
- Business: dashboard, inventory, orders (business account).
- Instructors: list and detail if applicable.

---

## Troubleshooting

| Symptom | Likely cause |
|--------|----------------|
| Integration tests fail with connection errors | Worker not running locally, or wrong `API_BASE_URL`. |
| `npm test` fails immediately on Node 16 | Switch to Node 20+ (`nvm use 20`). |
| App calls wrong API | Set `API_BASE_URL` for Expo or change defaults in `app.config.ts` / `http.ts`. |
| Remote DB schema errors after deploy | Run `npm run migrate` in `backend/`. |

---

## Related files

| Area | Path |
|------|------|
| Worker name / D1 binding | `backend/wrangler.toml` |
| Integration script | `backend/tests/test-api.js` |
| NPM scripts | `backend/package.json` |
| App API default | `frontend/app.config.ts`, `frontend/src/services/api/http.ts` |
