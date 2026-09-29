# Grow! — product features

High-level inventory of what the app ships today (mobile Expo / RN), plus cohort, friends, and marketplace behaviors.

**Brand:** consumer name is **Grow!** (tech ids may still say `growl`). See [`docs/brand/BRAND.md`](brand/BRAND.md).

---

## Authentication & identity

| Feature | Notes |
|--------|--------|
| Email sign-in / sign-up | Plain password over HTTPS; PBKDF2 on server; email verification required for sign-up; JWT in SecureStore only. |
| Demo accounts | Seed `demo@growl.app`, `instructor@growl.app`, `business@growl.app` (`npm run demo:local`); password `GrowlDemo123!`. |
| SSO | Google `idToken` / Facebook `accessToken` via `POST /auth/sso` when OAuth client IDs are configured. |
| Business vs consumer shells | `isBusiness` from API + fallback emails drives Root navigator into **Business** tabs vs **Individual** tabs. |
| Hydration | Auth restored from storage on launch; token cached in memory for HTTP. |

---

## Onboarding & personalization

| Feature | Notes |
|--------|--------|
| Category picker | Up to **3** paths such as `art:violin` or parent keys like `fitness`; drives feed relevance and marketplace ranking. |
| **Server sync + cohort friends** | On Continue, picks are written with `PUT /profile`. The backend runs **cohort friend linking**: users whose stored `metadata.categories` overlap on expanded cohort keys become mutual **friends** automatically (see below). |

### Cohort friends (same growth area)

- Each selected path contributes cohort keys: e.g. `art:violin` → `{ art:violin, art }`.
- Any **shared key** between two accounts implies they share a cohort (e.g. `art:piano` and `art:violin` both include `art`).
- Matching users are **auto-friended** (bidirectional `friend` edges with `source='cohort'`) when categories are saved, on profile load, or via `POST /social/friends/sync-cohort`.
- **Path change:** saving new categories **detaches** auto-cohort edges that no longer overlap and **attaches** new cohort peers. Explicit `source='manual'` friendships (Add friend) are kept. Legacy edges without `source` are treated as cohort for detach.
- **Feed** shows **your posts** and **friends’ posts** (cohort peers appear once auto-linked).
- Friend edges are stored as **`user_relationships.type = 'friend'`** in **both directions** (unless a **block** exists).

### Cross-path posts

- **Home / All Categories:** posts from **all friends** (any path) plus **non-friends whose post matches your growth paths**.
- **Category-filtered Home or Explore:** only posts whose **category matches** the selected path (parent key matches that parent or leaves under it). Cross-path friends’ posts do **not** appear under an unrelated chip.
- **Profile posts:** each post is labeled with the author’s growth path. If stored post category does not match their paths (legacy/seed data), the profile and feed show their first growth area instead.
- Explore remains **non-friend discovery**; friends belong on Home.

---

## Social graph & profiles

| Feature | Notes |
|--------|--------|
| **Add / remove friend** | From another user’s public profile: **Add friend** creates reciprocal edges via `POST /social/friends`; remove uses `DELETE /social/friends/:targetUserId`. |
| Friendship status | `GET /social/friends/status/:userId` powers button state. |
| Friend list API | `GET /social/friends` returns friends with basic username/avatar from metadata (UI list can be wired later). |
| Public profile | Header + counts from **`GET /profile/user/:userId`** (auth required); posts and stories from feed/stories APIs; journal tab still mock. |
| User relationships (existing types) | **follow**, **block**, **mute** remain in schema; **friend** + **friend_request** reserved for migrations / future flows. |

---

## Feed & content

| Feature | Notes |
|--------|--------|
| Feed | Paginated posts; categories; reactions/decay concepts in UI. |
| Create post | Image URL / caption / category; validation on Worker. |
| Comments & likes | Threaded comments; like toggle endpoints. |
| Stories | 24h stories, views counter; CRUD under `/stories`. |
| Reels / messaging entry points | Navigation shells present; depth varies by screen. |

---

## Moderation & Trust (ops)

| Feature | Notes |
|--------|--------|
| Consumer report / block | In-app menus; writes `reports` / blocks — no Admin UI required for reviewers. |
| Soft-hide | Admin decide sets `is_hidden` on posts/products (not hard-delete). Appeal overturn restores. Consumer feeds omit hidden rows. |
| Protected accounts | `review@`, `demo@`, `instructor@`, `business@` cannot be banned/hidden from admin (`403 PROTECTED_ACCOUNT`). |
| Admin + Seller web | `admin/dashboard` — staff T&S console + scoped seller portal. See [`ADMIN_PHASE0_DEPLOY.md`](ADMIN_PHASE0_DEPLOY.md). |

---

## Marketplace & commerce

| Feature | Notes |
|--------|--------|
| Product catalog | `GET /marketplace/products` with filters. |
| **Search** | **Debounced keyword** forwarded to the API (`search` query → SQL `LIKE` on name/description). Client also narrows by name/description/category/**subcategory** for snappy UX. |
| **Category filters** | Chips from the signed-in user’s onboarding paths; optional **subcategory strip** (e.g. Art → Violin) filters both API parameters and local ranking. |
| Ranking | Client-side relevance score from user categories + points + deterministic jitter. |
| Cart & checkout | Redux cart; checkout builds orders. |
| Orders | User order history; business-side order views. |
| Product detail | Dedicated stack screen from marketplace list. |

---

## Business / instructor surfaces

| Feature | Notes |
|--------|--------|
| Business tabs | Dashboard KPIs, inventory CRUD (D1), orders, marketing feed hooks, partnerships UI, settings (sign-out fixes, partnership shortcut). |
| Business hub (extended) | Customers list (LTV, order count), in-app notifications inbox, order fulfillment (tracking/carrier/label), refund requests, promo codes (Community), CSV export (orders/products), payouts stub, low-stock Catalog tab badge. |
| Instructor hub | Students/courses scaffolding from profile quick actions. |
| Instructor voting | Backend instructor votes table + routes. |
| Partnerships (UI) | Mock instructors + discover tab; wired navigation/alerts; future backend under `/business/partnerships`. |

---

## Other modules

| Feature | Notes |
|--------|--------|
| Journal | Entries model in DB; public/private flags in UI layers where wired. |
| KYC screen | Placeholder route for compliance flow. |
| Notifications / settings rows | Switches and navigation stubs across profile & business settings. |
| Investor / docs tooling | Python deck generator under `docs/investor-pitch/` (out of app runtime). |

---

## Demo data (real image URLs)

Apply **`backend/scripts/seed-demo-social.sql`** to D1 (see file header for `wrangler d1 execute`). It inserts five users (`demo-*@growl.seed`), ten posts, six stories (HTTPS images), sample likes/comments, and demo friend edges. Password for all demo seeds: **`growlseed123`** (SHA-256 matches email sign-in flow).

---

## API surface (representative)

- **Auth:** `/auth/sign-up`, `/sign-in`, `/sign-out`, `/sso`
- **Profile:** `GET/PUT /profile` (categories trigger cohort sync); **`GET /profile/user/:userId`** for another user’s public summary (no email)
- **Social:** `GET /social/friends`, `POST /social/friends`, `GET /social/friends/status/:id`, `DELETE /social/friends/:id`, `POST /social/friends/sync-cohort`, `GET /social/friends/connections`, `GET /social/search?q=`
- **Marketplace:** products CRUD, orders, filters `category`, `subcategory`, `search`
- **Feed / stories / instructor / business:** as registered in `backend/src/index.ts`

---

## Suggested next increments

- Friend **requests** (already reserved enum) instead of immediate mutual accept policy.
- Feed prioritization using friend graph (“friends first”).
- Pagination + cursor for marketplace search at scale.
- Upload pipeline for local images (posts/products) instead of stripping non-HTTP URLs.
