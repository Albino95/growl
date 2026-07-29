# Grow! landing

Marketing site for **Grow!** — Next.js App Router, emerald brand, React Three Fiber hero, Vercel-ready SEO.

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
| `NEXT_PUBLIC_SITE_URL` | Yes (prod) | Canonical URL, e.g. `https://grow.app` |
| `NEXT_PUBLIC_APP_STORE_URL` | No | App Store link (placeholder until live) |
| `NEXT_PUBLIC_PLAY_STORE_URL` | No | Play Store link |
| `RESEND_API_KEY` | No | Sends waitlist signup notification email |
| `WAITLIST_TO` | No | Inbox for waitlist alerts (default `hello@grow.app`) |
| `EMAIL_FROM` | No | Resend from address |

Without `RESEND_API_KEY`, waitlist signups are logged server-side only (fine for local / early preview).

## Vercel

1. Import the monorepo (or this package as its own repo).
2. **Root Directory:** `landing`
3. Framework preset: **Next.js**
4. Set env vars above for Production (and Preview if useful).
5. Attach domain `grow.app` (+ redirect `www` → apex or vice versa).
6. After deploy, verify:
   - `https://grow.app/sitemap.xml`
   - `https://grow.app/robots.txt`
   - Open Graph via a sharing debugger

## SEO checklist

- [x] Metadata API (`title`, `description`, canonical, robots)
- [x] Open Graph image (`/opengraph-image`)
- [x] `sitemap.ts` / `robots.ts`
- [x] JSON-LD Organization + WebSite + SoftwareApplication + FAQPage
- [x] Sticky nav, FAQ, scroll progress
- [ ] Confirm `NEXT_PUBLIC_SITE_URL` matches live domain
- [ ] Replace store URL placeholders when apps are live

## Structure

```
landing/
  src/app/           # routes, SEO, waitlist API
  src/components/    # Nav, Hero (3D), sections, FAQ, waitlist, footer
  src/lib/seo.ts
  public/
```
