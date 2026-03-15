# Users Table Analysis

## Schema Comparison

### Migration Schema (0001_initial_schema.sql)
```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  points INTEGER DEFAULT 0,
  is_instructor INTEGER DEFAULT 0,
  is_business INTEGER DEFAULT 0,
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### CSV Export Columns
✅ id
✅ email
✅ password_hash
✅ points
✅ is_instructor
✅ is_business
✅ metadata
✅ created_at
✅ updated_at

## Result: ✅ Schema Matches Perfectly

**No migration needed!** Your users table structure matches the migration schema exactly.

## Issues Found

### 1. Business Account Flag
The `business@growl.app` account has:
- `is_business: 0` ❌ (should be `1`)
- `is_instructor: 0` (optional, but business accounts can also be instructors)

**Fix:** Update the business account:
```sql
UPDATE users 
SET is_business = 1 
WHERE email = 'business@growl.app';
```

### 2. Password Hash Format
The password hashes in your CSV are SHA-256 hex strings (64 characters), which is correct:
- Frontend sends: SHA-256 hash of password
- Backend compares: `passwordHash === user.password_hash`
- Format: ✅ Correct

Example: `207f777b7a35d8c12a4da158553f7adf64f19118e5ecfe79812f071e8ebd4248`

## Current Users in Database

1. **business@growl.app** - Business account (needs `is_business = 1`)
2. **marketplace@growl.app** - System account for products
3. **system-products@growl.app** - System account for products
4. **test-*@example.com** - Test users from integration tests

## Recommendations

1. **Update Business Account:**
   ```sql
   UPDATE users 
   SET is_business = 1, 
       is_instructor = 1  -- Business accounts can also be instructors
   WHERE email = 'business@growl.app';
   ```

2. **Verify Demo Accounts:**
   - Demo accounts (`demo@growl.app`, `instructor@growl.app`, `business@growl.app`) should exist in the database OR
   - They can work via the demo token fallback (which we just implemented)

3. **No Migration Needed:**
   - Your schema is correct
   - All columns match
   - Data types are correct

## How to Update Business Account

You can run this SQL directly on your database:

```sql
UPDATE users 
SET is_business = 1,
    is_instructor = 1,
    updated_at = datetime('now')
WHERE email = 'business@growl.app';
```

Or use wrangler:
```bash
cd backend
npx wrangler d1 execute growl-db --remote --command="UPDATE users SET is_business = 1, is_instructor = 1, updated_at = datetime('now') WHERE email = 'business@growl.app';"
```
