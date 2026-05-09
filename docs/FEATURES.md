# Growl — product features

High-level inventory of what the app ships today (mobile Expo / RN), plus the cohort friends & marketplace behaviors added recently.

---

## Authentication & identity

| Feature | Notes |
|--------|--------|
| Email sign-in / sign-up | Password hashed client-side; JWT-style tokens against Workers API; Redux persistence via SecureStore. |
| Demo fallback accounts | Offline/demo flows (`demo@growl.app`, `instructor@growl.app`, `business@growl.app`) generate JWT-like demo tokens when API unreachable. |
| SSO scaffold | Google/Facebook hooks call `/auth/sso`; mocked elsewhere until OAuth wired end-to-end. |
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
- Friend edges are stored as **`user_relationships.type = 'friend'`** in **both directions** (unless a **block** exists).

---

## Social graph & profiles

| Feature | Notes |
|--------|--------|
| **Add / remove friend** | From another user’s public profile: **Add friend** creates reciprocal edges via `POST /social/friends`; remove uses `DELETE /social/friends/:targetUserId`. |
| Friendship status | `GET /social/friends/status/:userId` powers button state. |
| Friend list API | `GET /social/friends` returns friends with basic username/avatar from metadata (UI list can be wired later). |
| Public profile | Tabs for posts / stories / journal (mix of API + mock seed data by `userId`). |
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

## API surface (representative)

- **Auth:** `/auth/sign-up`, `/sign-in`, `/sign-out`, `/sso`
- **Profile:** `GET/PUT /profile` (categories trigger cohort sync)
- **Social:** `GET /social/friends`, `POST /social/friends`, `GET /social/friends/status/:id`, `DELETE /social/friends/:id`
- **Marketplace:** products CRUD, orders, filters `category`, `subcategory`, `search`
- **Feed / stories / instructor / business:** as registered in `backend/src/index.ts`

---

## Suggested next increments

- Friend **requests** (already reserved enum) instead of immediate mutual accept policy.
- Feed prioritization using friend graph (“friends first”).
- Pagination + cursor for marketplace search at scale.
- Upload pipeline for local images (posts/products) instead of stripping non-HTTP URLs.
