# Grow! landing

Marketing site for **Grow!** ([letsgrow.lu](https://letsgrow.lu)) — Next.js App Router on Vercel (region `fra1`).
The home page is "The Living Week" (see `docs/LANDING_DESIGN.md`): a server-rendered hero with an
interactive Today check-in demo, an App Store CTA for iPhone, and an email waitlist for Android.

## Develop

```bash
cd landing
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build

```bash
npm run build
npm start
```

## Environment

Copy `.env.example` → `.env.local`:

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_SITE_URL` | Yes (prod) | Canonical URL, e.g. `https://letsgrow.lu` |
| `GROW_API_URL` | No | Grow! API base incl. version, server-side only. Default `https://growl-backend-production.wispy-leaf-4e8b.workers.dev/api/v1`. Used by the waitlist proxy and invite lookups (`/i/[code]`). |
| `NEXT_PUBLIC_APP_STORE_URL` | No | Override the App Store link. Default is the live listing `https://apps.apple.com/app/id6809046287` (`APP_STORE_URL` in `src/lib/seo.ts`). |
| `NEXT_PUBLIC_PLAY_STORE_URL` | No | Play Store link (only shown once it is a real listing) |
| `RESEND_API_KEY` | No | Sends a notification email per waitlist signup |
| `WAITLIST_TO` | No | Inbox for waitlist alerts (default `hello@letsgrow.lu`) |
| `EMAIL_FROM` | No | Resend from address |

## Waitlist flow

1. The form posts `{ email, platform?, source?, company? }` to `POST /api/waitlist` (this app).
   `platform` is `android` (default) | `ios` | `web`; `source` is a short tag (≤ 40 chars) like `hero`.
   `company` is a hidden honeypot: if it is filled the route pretends success and stores nothing.
2. The route validates the email, then forwards server-side to `POST ${GROW_API_URL}/waitlist`
   with the visitor IP in `X-Grow-Client-IP` (rate limiting only, never stored).
3. The API (`backend/src/routes/waitlist.ts`) stores the signup in D1 table `waitlist_signups`
   (migration `0035_waitlist.sql`, unique per email + platform). It always answers `{ ok: true }` for
   valid input, so it cannot be used to check whether an address is listed. Limits: 10/hour per
   visitor, 300/hour per connecting IP.
4. If `RESEND_API_KEY` is set, a notification email is sent (email HTML-escaped). A failed email does
   not fail the signup.
5. The route answers `{ ok: true, message }` (200) or `{ error }` with 400 / 429 / 502 / 503.

To read the list: `wrangler d1 execute <db> --remote --command "SELECT email, platform, source, created_at FROM waitlist_signups ORDER BY created_at DESC"` (run from `backend/`).

## Vercel

1. Import the monorepo (or this package as its own repo).
2. **Root Directory:** `landing`
3. Framework preset: **Next.js**
4. Set env vars above for Production (and Preview if useful).
5. Attach domain `letsgrow.lu` (+ redirect `www.letsgrow.lu` → apex or vice versa).
6. After deploy, verify:
   - `https://letsgrow.lu/sitemap.xml`
   - `https://letsgrow.lu/robots.txt`
   - Open Graph via a sharing debugger

### DNS (EuroDNS → Vercel)

In Vercel → Project → **Settings** → **Domains**, add `letsgrow.lu` and `www.letsgrow.lu`, then in EuroDNS create the records Vercel shows (typically):

| Host | Type | Value |
|------|------|--------|
| `@` | A | `76.76.21.21` |
| `www` | CNAME | `cname.vercel-dns.com` |

Set Production env `NEXT_PUBLIC_SITE_URL=https://letsgrow.lu` and redeploy.

## SEO checklist

- [x] Metadata API (`title`, `description`, canonical, robots)
- [x] Open Graph image (`/opengraph-image`)
- [x] `sitemap.ts` / `robots.ts`
- [x] JSON-LD Organization + WebSite + SoftwareApplication + FAQPage
- [x] `/i/*` invites and `/pitch` disallowed in robots and `noindex`
- [ ] Confirm `NEXT_PUBLIC_SITE_URL` matches live domain
- [x] App Store URL points at the live listing (id6809046287)
- [ ] Play Store URL when Android ships

## Structure

```
landing/
  src/app/           # routes, SEO, OG image, waitlist API proxy, /i/[code] invites
  src/components/    # nav, hero + check-in demo, week sections, FAQ, waitlist, footer
  src/lib/seo.ts     # site constants, App Store URL, FAQ items, JSON-LD
  public/
```
