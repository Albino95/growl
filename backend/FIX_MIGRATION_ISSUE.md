# Fix Migration Issue

## Problem

Wrangler says "✅ No migrations to apply!" but the tables don't exist. This means the migration was marked as applied, but the tables weren't actually created.

## Solution: Apply Migration Manually

Since Wrangler thinks the migration is already applied, we need to manually execute the SQL:

### Option 1: Apply SQL File Directly

```bash
cd backend
npx wrangler d1 execute growl-db --file=migrations/0001_initial_schema.sql
```

### Option 2: Use the Script

```bash
cd backend
bash apply-migration-manually.sh
```

### Option 3: Execute SQL Commands Directly

If the above doesn't work, you can execute the SQL directly:

```bash
cd backend

# First, check what tables exist
npx wrangler d1 execute growl-db --command "SELECT name FROM sqlite_master WHERE type='table';"

# Then apply the migration SQL
npx wrangler d1 execute growl-db --file=migrations/0001_initial_schema.sql

# Verify tables were created
npx wrangler d1 execute growl-db --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

## Verify It Worked

After applying the migration, verify:

```bash
# Check tables exist
npx wrangler d1 execute growl-db --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"

# Should show:
# - businesses
# - conversations
# - instructor_votes
# - messages
# - order_items
# - orders
# - post_comments
# - post_engagement
# - posts
# - products
# - users

# Then test
npm test
```

## If Migration Fails

### Check for existing tables:
```bash
npx wrangler d1 execute growl-db --command "SELECT name FROM sqlite_master WHERE type='table';"
```

### If tables partially exist:
The migration uses `CREATE TABLE IF NOT EXISTS`, so it's safe to run multiple times. If some tables exist and others don't, just run the migration again.

### Check Cloudflare Dashboard:
1. Go to https://dash.cloudflare.com
2. Workers & Pages → D1
3. Select `growl-db`
4. Check the "Migrations" tab
5. Check for any errors

## Alternative: Reset Migration State

If you need to reset the migration state (WARNING: This will require reapplying all migrations):

```bash
# This is only if you need to completely reset
# Be careful - this affects migration tracking
npx wrangler d1 migrations list growl-db
```

## Quick Fix Command

```bash
cd backend && npx wrangler d1 execute growl-db --file=migrations/0001_initial_schema.sql && npm test
```

This will:
1. Apply the migration SQL directly
2. Run tests to verify
