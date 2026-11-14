# Admin Phase 0 — Apple-safe deploy checklist

Use this before deploying Worker changes to **production** while App Review is active.

Admin UI (Cloudflare Pages) is safe to ship anytime — it does not change the App Store binary. The **Worker + D1** path is the risk surface for review accounts and feed contracts.

## Guardrails

| Rule | Detail |
|------|--------|
| Soft-hide only | Decide uses `is_hidden`; never hard-delete posts/products from admin |
| Protected accounts | Enforcement blocked for `review@growl.app`, `demo@growl.app`, `instructor@growl.app`, `business@growl.app` → `403 PROTECTED_ACCOUNT` |
| MFA flag | `ADMIN_MFA_REQUIRED` must stay **`false`** on production until Apple finishes review |
| Consumer contracts | Do not change consumer auth / report / block / delete-account shapes mid-review |
| Login limits | Admin login: **20 / IP / 15m** and **10 / email / 15m** (KV). Smoke must not hammer `admin@growl.app` |

## Deploy order

1. Apply migration `0017_moderation_soft_hide.sql` on **QA** D1 (idempotent `ALTER` / columns already present is OK).
2. Deploy backend to **QA** Worker (`ADMIN_MFA_REQUIRED=false`).
3. Seed QA admin + review user if missing (`seed:admin` QA target, `seed:review:qa`).
4. Deploy Admin Pages (safe anytime).
5. Run smoke below on QA.
6. Only if green **and** App Review risk is accepted: migrate **production** D1 → deploy production Worker with `ADMIN_MFA_REQUIRED=false`.

## Smoke checklist (QA)

### Automated

```bash
cd backend
npm run test:admin-phase0-smoke:qa
# After a failed rate-limit probe that locked staff login:
SKIP_RATE_LIMIT=1 npm run test:admin-phase0-smoke:qa
```

Covers: staff login, `/me`, dashboard, audit `target_type` filter, protected ban, soft-hide decide + 404, MFA setup payload, login 429 (disposable email).

### Manual — consumer (must stay green)

- [ ] Sign in as `review@growl.app` / `GrowlReview123!`
- [ ] Feed loads; open a post detail
- [ ] Report a post/user (creates report)
- [ ] Block a user
- [ ] Delete-account / privacy URL still reachable

### Manual — admin UI

- [ ] Staff login at Admin Pages → Dashboard loads
- [ ] Moderation queue → open case → **Hide content (soft-remove)** → confirm soft-hide copy → post gone from feed / 404
- [ ] Appeals overturn / soft-unhide restores visibility
- [ ] Attempt ban against `review@growl.app` → blocked
- [ ] Audit log filters by `target_type` / `target_id`
- [ ] MFA Settings: generate secret + recovery codes (optional enroll on QA)

## Hold production Worker if

- Apple is mid-session and any smoke item fails
- Migration cannot be applied cleanly
- You are unsure whether review accounts exist only on QA (do **not** seed demos on production)

Admin UI can still ship to Pages while Worker is held.

## Ops notes

| Topic | Notes |
|-------|-------|
| QA Worker | `https://growl-backend-qa.wispy-leaf-4e8b.workers.dev/api/v1` |
| Legacy / personal prod hostname | `https://growl-backend.albino-ndreu.workers.dev/api/v1` (admin `.env.development` default) |
| Soft-hide migration | `backend/migrations/0017_moderation_soft_hide.sql` |
| Smoke script | `backend/tests/test-admin-phase0-smoke.js` |
| Admin README | `admin/README.md` |

Do **not** mention the admin panel in App Store Review notes. Reviewers use the consumer app + `review@growl.app`.

## Status (2026-09-28)

- Code complete in repo (Phase 0): soft-hide, protected accounts, MFA encrypt + recovery codes, audit filters, assign audit.
- Local D1 migration `0017` applied.
- QA Worker deployed with `ADMIN_MFA_REQUIRED=false`; QA soft-hide columns verified.
- Admin dashboard UI: cream/emerald shell, brand mark, soft-hide confirm copy, MFA flow polish.
- QA automated smoke green (`test-admin-phase0-smoke.js`: login, protected ban, soft-hide + 404, MFA setup). Use `SKIP_RATE_LIMIT=1` when re-running inside the same 15m login window.
- **Production Worker intentionally NOT deployed** while App Review is active — run checklist then `npm run migrate:production` + `npm run deploy:production` only after Apple finishes or smoke is green and risk accepted.
