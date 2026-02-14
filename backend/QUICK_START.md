# Backend Quick Start Guide

## 🚀 Start the Backend

### Option 1: Deploy to Cloudflare (Recommended - Already Running)

Your backend is already deployed and running at:
```
https://growl-backend.albino-ndreu.workers.dev
```

**No need to start anything!** It's live on Cloudflare.

### Option 2: Run Locally for Development

```bash
cd backend

# Install dependencies (if not already done)
npm install

# Run migrations on local database
npm run migrate:local

# Start local dev server
npm run dev
```

Local server will be at: `http://localhost:8787`

## 📋 Available Commands

```bash
npm run dev              # Start local development server
npm run deploy           # Deploy to Cloudflare Workers
npm run migrate          # Run migrations on production database
npm run migrate:local    # Run migrations on local database
npm run login            # Login to Cloudflare
npm run type-check       # Type check TypeScript
npm run lint             # Lint code
```

## 🔧 First Time Setup

### 1. Login to Cloudflare
```bash
npm run login
```

### 2. Run Production Migrations
```bash
npm run migrate
```

This creates all tables in your Cloudflare D1 database.

### 3. Set JWT Secret
```bash
npx wrangler secret put JWT_SECRET
```

When prompted, paste:
```
BYD8dKBtANZrhuL8yEvnO/ctZC0O5u/ivBw/uSYWavc=
```

### 4. Deploy
```bash
npm run deploy
```

## ✅ Verify It's Working

Test the health endpoint:
```bash
curl https://growl-backend.albino-ndreu.workers.dev/api/v1/health
```

Should return:
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "...",
    "environment": "development",
    "database": "connected",
    "kv": "connected"
  }
}
```

## 📁 Project Structure

```
backend/
├── src/
│   ├── index.ts          # Main entry point
│   ├── types.ts          # TypeScript types
│   ├── routes/
│   │   ├── auth.ts       # Authentication endpoints
│   │   └── feed.ts       # Feed endpoints
│   └── utils/
│       ├── auth.ts       # Auth utilities
│       ├── response.ts   # Response helpers
│       ├── validation.ts # Zod schemas
│       └── id.ts         # ID generation
├── migrations/
│   └── 0001_initial_schema.sql
├── wrangler.toml         # Cloudflare config
├── package.json
└── tsconfig.json
```

## 🔗 API Endpoints

- `GET /api/v1/health` - Health check
- `POST /api/v1/auth/sign-up` - Register
- `POST /api/v1/auth/sign-in` - Login
- `GET /api/v1/feed/feed` - Get feed
- `POST /api/v1/feed/posts` - Create post
- `GET /api/v1/feed/posts/user/:userId` - Get user posts

## 🐛 Troubleshooting

### "Missing script" errors
Make sure you're in the `backend/` directory and `package.json` has the scripts.

### Database errors
Run migrations: `npm run migrate` (production) or `npm run migrate:local` (local)

### Deployment errors
Make sure you're logged in: `npm run login`


