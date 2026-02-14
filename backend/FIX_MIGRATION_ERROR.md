# Fix Migration Error

## The Problem

The error shows:
1. **Running on LOCAL database** - Need to use `--remote` flag
2. **SQL Error** - "no such column: user_id at offset 60"

## Solution 1: Run on Remote Database

Add the `--remote` flag to execute on production:

```bash
npx wrangler d1 execute growl-db --file=migrations/0001_initial_schema.sql --remote
```

## Solution 2: Clear Local Database First

If you want to test locally first, clear the local database:

```bash
# Delete local database state
rm -rf .wrangler/state/v3/d1

# Then run migration locally
npx wrangler d1 execute growl-db --file=migrations/0001_initial_schema.sql
```

## Solution 3: Enable Foreign Keys (if needed)

SQLite might need foreign keys enabled. The migration should work, but if issues persist, we can add:

```sql
PRAGMA foreign_keys = ON;
```

at the beginning of the migration file.

## Recommended: Run on Remote

For production, always use:

```bash
npx wrangler d1 execute growl-db --file=migrations/0001_initial_schema.sql --remote
```

This applies the migration to your production database.

## Verify After Migration

```bash
# Check tables on remote
npx wrangler d1 execute growl-db --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;" --remote

# Then test
npm test
```
