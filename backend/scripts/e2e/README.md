# API e2e smoke / regression test

`run.mjs` makes about 155 checks against a deployed worker (QA by default) using the four public demo accounts. It needs Node 18+ and has no dependencies.

```bash
cd backend
npm run e2e:qa                         # = node scripts/e2e/run.mjs
E2E_ONLY=auth,feed npm run e2e:qa      # run only some sections
E2E_BASE=http://localhost:8787/api/v1 node scripts/e2e/run.mjs
```

Each check prints `✓` (pass), `✗` (fail) or `–` (skipped), with its time. At the end you get a summary and a list of every failure, showing the endpoint, the HTTP status and the error code. The exit code is 1 if any check fails, a cleanup step fails, or the runner crashes.

## Environment

| Var | Default |
| --- | --- |
| `E2E_BASE` | `https://growl-backend-qa.wispy-leaf-4e8b.workers.dev/api/v1` |
| `E2E_DELAY_MS` | `120` (pause before every request; requests run one at a time) |
| `E2E_TIMEOUT_MS` | `20000` |
| `E2E_ONLY` | all sections. Choose from `health,auth,profile,feed,journal,social,messages,growth,marketplace,instructor,business,wave4` |
| `E2E_VERBOSE=1` | prints response bodies for failing checks |
| `E2E_{DEMO,INSTRUCTOR,BUSINESS,REVIEW}_EMAIL` / `_PASSWORD` | the seeded demo accounts (`seed-demo-core-accounts.sql`, `seed-app-review-account.sql`) |

Passwords, JWTs and refresh tokens are never printed.

## Sections

- **Health**: `/health`, unknown route returns 404.
- **Auth**: sign in with each role, wrong password, invalid or missing token. Refresh rotation: the old token replayed within the 60 s grace window returns the *same* pair. The old token is refused once its replacement has rotated. Sign-out revokes.
- **Profile / me**: profile (plus stats), public profile, `me/today` GET, then PUT check-in with an `Idempotency-Key` replay. Also streak, badges, recap, progress, invite and invite lookup, privacy roundtrip (restored), life-mode set, get and clear (restored), insights 30 and 90 days, `me/circle/today`.
- **Feed**: `foryou`, `home` and `explore`, 3 pages each with `cursor`, checking for no duplicate ids. Also the legacy page, a bad cursor, a cursor from the wrong mode, and a request without auth. Likes are toggled and restored. A comment with an `@mention` is posted with an `Idempotency-Key` replay (same id), then deleted. A reused key on another path returns 422, and a bad key returns 400.
- **Journal**: create (idempotent), update, list, delete.
- **Social**: friends, connections, friend status, legacy `/social/search`, `/search` (text, `#tag`, paging, empty), `mentions/suggest`, blocks, buddies. The invite and decline flow runs only if demo and review are friends. Notifications and unread count for demo and review.
- **Messages**: conversations, unread count. Opens a DM with the first test account (review, instructor or business) that is demo's friend. Sends with an idempotent replay, checks the peer sees exactly one copy, adds and removes a reaction, checks the peer can't unsend, then unsends.
- **Stories / challenges / circles / seeds**: lists and detail. Join and leave only on a challenge demo has never joined.
- **Marketplace (buyer)**: products list, detail, search and category, 404, buyer orders. **Checkout must be disabled**: `payment-config.enabled` must be `false`. Checkout and createOrder are then expected to return `503 PAYMENTS_DISABLED`. If payments are enabled, those two calls are *skipped* (never called) and the check fails.
- **Instructor**: hub, eligibility, suggest-endorsers, offering, inquiries, contracts and contract detail, endorsement requests and status, instructors, reviews, students, coaching thread, review eligibility, and 403 for non-instructors.
- **Business**: dashboard (week and month), products, orders, customers, notifications, promo codes, partnerships and discover, analytics (timeseries, funnel, top products, partnerships), campaigns, settings, CSV exports, and 403 for non-business users. Creates an `[e2e]` product (stock 0), updates it, lists it, checks another user can't edit it, then deletes it. There are no separate "kpis" or "inventory" endpoints: the dashboard covers the KPIs and `/business/products` covers inventory.
- **Wave 4**: `sectionWave4()` holds marked `TODO(wave4-bizx|coachx|userx)` hooks. Add checks there as those modules (`src/routes/wave3/{bizx,coachx,userx}.ts`) gain routes.

## Safety

- Everything the script creates is prefixed `[e2e]` plus a run id, and is registered for cleanup. Cleanup runs in a `finally` block even after failures. Any cleanup step that doesn't finish is listed, and the run exits 1.
- The script only writes to the four test accounts. Likes and comments target a post owned by demo (falling back to review). It never blocks, reports, follows or unfriends anyone.
- **Posts are not created**: the API has no post-delete route, so the script only checks that a text-only post is rejected.
- Some effects can't be undone through the API:
  - The demo account's check-in for today: created with mood 3 if missing, otherwise left unchanged.
  - An unsent DM, which stays as an empty "unsent" row in the conversation.
  - Notifications created by the mention, buddy invite and DM.
  - Rate-limit counters.
- Rate limits to keep in mind if you run it many times in a row: sign-in allows 30 per 15 min per IP, and the script uses 6. Posts allow 20 per hour and comments 30 per 10 min.
