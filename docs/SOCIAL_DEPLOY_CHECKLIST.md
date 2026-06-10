# Social Deploy Checklist (Comments/Likes/Block)

Use this right before release and after backend deploy.

## 0) Fast path: deploy now

If you have local backend changes and want them live on Cloudflare immediately:

```bash
cd backend
npx wrangler login
npm run migrate
npm run deploy
```

Then run smoke on the deployed API:

```bash
cd backend
API_BASE_URL=https://growl-backend.albino-ndreu.workers.dev/api/v1 \
SMOKE_EMAIL=demo@growl.app \
SMOKE_PASSWORD=GrowlDemo123! \
npm run test:social-smoke
```

If smoke still shows `feed-load - items=0`, seed remote social demo data:

```bash
cd backend
npm run seed:social:remote
```

Then rerun `npm run test:social-smoke`.

## 1) Pre-deploy checks

- Confirm backend routes exist and are wired:
  - `GET /feed/posts/:postId/comments`
  - `GET /feed/posts/:postId/likes`
  - `POST /social/block`
  - `DELETE /social/block/:targetUserId`
  - `GET /social/friends/status/:targetUserId`
- Confirm frontend uses backend-driven data only (no local mock fallback paths).
- Ensure demo/seed data is available in target env if you plan to validate with mocks.

## 2) Deploy backend first

```bash
cd backend
npm run deploy
```

If schema changes are pending:

```bash
cd backend
npm run migrate
```

## 3) Run social smoke script

### Deployed backend

```bash
cd backend
API_BASE_URL=https://growl-backend.albino-ndreu.workers.dev/api/v1 \
SMOKE_EMAIL=demo@growl.app \
SMOKE_PASSWORD=GrowlDemo123! \
npm run test:social-smoke
```

### Local backend (`wrangler dev` on port 8787)

```bash
cd backend
SMOKE_EMAIL=demo@growl.app \
SMOKE_PASSWORD=GrowlDemo123! \
npm run test:social-smoke:local
```

## 4) What smoke validates

- Sign-in works and token is valid.
- Feed returns at least one post.
- Comments list loads for a feed post.
- Comments count matches post card metadata.
- Likes list endpoint returns:
  - total likes
  - liker list
  - friend likes count
  - friend liker list
  - friend liker subset is consistent with full liker list
- Block flow:
  - block request succeeds
  - friendship status returns `blocked: true`
  - blocked user disappears from feed
  - cleanup unblock succeeds

## 5) Manual UI spot-check (mobile)

- Feed card comment badge matches comment sheet list count.
- Tapping likes opens liker list modal.
- Tapping "X from friends" opens friend liker list.
- Three-dots menu -> block works and immediately removes blocked user posts from feed.

## 6) Rollback guardrails

- If smoke fails on deployed backend:
  - pause frontend deploy
  - inspect worker logs for failing endpoint
  - re-run smoke after fix before promoting frontend

