# Production data seeding

Run these against the **remote** Cloudflare D1 database before store review or when Feed / Explore / Marketplace look empty.

## Prerequisites

```bash
cd backend
npx wrangler login
npm run migrate
```

## Seed commands

| Command | What it adds |
|---------|----------------|
| `npm run seed:remote` | Marketplace products (`seed-products-enhanced.sql`) |
| `npm run seed:social:remote` | Demo posts, stories, social graph |
| `npm run seed:core:remote` | Core demo accounts (review only — hide from production UI) |
| `npm run demo:remote` | Full demo bundle: migrate + core + social + email verify fix |

## Recommended production checklist

1. `npm run migrate`
2. `npm run seed:remote`
3. `npm run seed:social:remote`
4. Smoke test: `API_BASE_URL=https://growl-backend.albino-ndreu.workers.dev/api/v1 npm run test:social-smoke`

## Verify in app

- **Feed** — "Suggested for you" shows ≥5 posts for users with categories
- **Explore** — stories, reels, posts grid, shop picks populated
- **Marketplace** — product carousel and catalog list non-empty

## Notes

- Seeding is idempotent where SQL uses `INSERT OR IGNORE` / upserts; re-run is safe for products.
- Demo account credentials belong in `docs/STORE_SUBMISSION.md` for reviewers, not in the app UI.
