# Quick Migration Fix

## The Issue

You're running the migration on the **local** database, but you need it on the **remote** (production) database.

## The Fix

Add `--remote` flag:

```bash
npx wrangler d1 execute growl-db --file=migrations/0001_initial_schema.sql --remote
```

## Complete Command Sequence

```bash
cd backend

# Apply to remote database
npx wrangler d1 execute growl-db --file=migrations/0001_initial_schema.sql --remote

# Verify tables were created
npx wrangler d1 execute growl-db --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;" --remote

# Test
npm test
```

## Why This Happens

- Without `--remote`: Runs on local database (`.wrangler/state/v3/d1`)
- With `--remote`: Runs on production Cloudflare D1 database

For production, always use `--remote`!
