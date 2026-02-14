# Solution: Apply Migration Manually

## The Problem

Wrangler says "✅ No migrations to apply!" but the tables don't exist. This means the migration was marked as applied, but the SQL didn't actually run.

## The Fix

Apply the migration SQL file directly:

```bash
cd backend
npx wrangler d1 execute growl-db --file=migrations/0001_initial_schema.sql
```

## Verify It Worked

After running the command above, check if tables were created:

```bash
npx wrangler d1 execute growl-db --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

You should see:
- instructor_votes
- journal_entries
- order_items
- orders
- post_engagement
- products
- reports
- user_relationships
- users
- posts

## Then Test

```bash
npm test
```

You should now see tests passing! ✅

## Complete Command Sequence

```bash
cd backend

# Apply migration
npx wrangler d1 execute growl-db --file=migrations/0001_initial_schema.sql

# Verify tables
npx wrangler d1 execute growl-db --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"

# Test
npm test
```

## Why This Happens

Wrangler tracks migrations in a separate table. Sometimes the migration gets marked as "applied" but the actual SQL doesn't execute. Running the SQL file directly bypasses the migration tracking and just executes the SQL.

Since the migration uses `CREATE TABLE IF NOT EXISTS`, it's safe to run multiple times - it won't create duplicate tables.
