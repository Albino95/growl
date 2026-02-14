# Backend Diagnostic Guide

## Current Status

Based on test results:
- ✅ **Backend is running** - Health check passes
- ✅ **Database connection works** - Can connect to D1
- ❌ **Database tables missing** - "no such table: users" error
- ❌ **Migrations not run** - Tables need to be created

## Issue Analysis

The backend code is working correctly, but the database schema hasn't been initialized. This is why:
- Health check passes (connection works)
- Sign up fails (tables don't exist)
- Other endpoints fail (depend on tables)

## Solution Steps

### Step 1: Verify Backend Deployment

Check if latest code is deployed:

```bash
cd backend

# Check if you're logged in
npx wrangler whoami

# Deploy latest code
npm run deploy
```

### Step 2: Run Database Migrations

This is the critical step that's missing:

```bash
cd backend

# Run migrations on production database
npm run migrate
```

This will create all tables:
- users
- posts
- post_engagement
- post_comments
- products
- orders
- order_items
- instructor_votes
- businesses
- conversations
- messages

### Step 3: Verify Tables Were Created

```bash
# Check if tables exist
npx wrangler d1 execute growl-db --command "SELECT name FROM sqlite_master WHERE type='table';"
```

You should see all the table names listed.

### Step 4: Test Again

```bash
npm test
```

After migrations, you should see:
- ✅ Sign Up passing
- ✅ Sign In passing
- ✅ Other endpoints working

## Common Issues

### Issue: "wrangler: command not found"
**Fix:** Install wrangler globally or use npx:
```bash
npm install -g wrangler
# or
npx wrangler d1 migrations apply growl-db
```

### Issue: "Not logged in"
**Fix:** Login to Cloudflare:
```bash
npx wrangler login
```

### Issue: "Database not found"
**Fix:** Check `wrangler.toml` has correct database_id:
```toml
[[d1_databases]]
binding = "DB"
database_name = "growl-db"
database_id = "be2fe4d4-4f8c-474f-ba82-1c083b3cb1ef"
```

### Issue: Migrations fail silently
**Fix:** Check migration file exists:
```bash
ls -la migrations/
# Should show: 0001_initial_schema.sql
```

## Quick Fix Command

Run this single command to fix everything:

```bash
cd backend && npm run deploy && npm run migrate && npm test
```

## Verification Checklist

- [ ] Backend deployed (`npm run deploy` succeeded)
- [ ] Migrations run (`npm run migrate` succeeded)
- [ ] Tables exist (check with SQL command above)
- [ ] Health check passes (`npm test` shows ✅)
- [ ] Sign up works (`npm test` shows ✅ for Sign Up)

## Still Not Working?

If issues persist after migrations:

1. **Check Cloudflare Dashboard:**
   - Go to https://dash.cloudflare.com
   - Check Workers & Pages > Your Worker
   - Check D1 > Your Database
   - Look for errors in logs

2. **Check Local vs Production:**
   - Make sure you're running migrations on the correct database
   - Check `wrangler.toml` environment settings

3. **Check Migration File:**
   - Verify `migrations/0001_initial_schema.sql` exists
   - Check it has valid SQL syntax

4. **Redeploy:**
   ```bash
   npm run deploy
   ```
