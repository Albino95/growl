# Quick Fix for Backend

## The Problem

Your backend code is **correct**, but the database tables don't exist. This is why:
- ✅ Health check passes (backend is running)
- ❌ Sign up fails ("no such table: users")
- ❌ Other endpoints fail (they need tables)

## The Solution (2 Steps)

### Step 1: Deploy Backend (if you made code changes)

```bash
cd backend
npm run deploy
```

### Step 2: Run Migrations (THIS IS THE CRITICAL STEP)

```bash
cd backend
npm run migrate
```

This creates all the database tables. **This is what's missing!**

## Verify It Worked

```bash
cd backend
npm test
```

You should now see:
- ✅ Sign Up passing
- ✅ Sign In passing
- ✅ Other tests working

## If Migrations Fail

### Check you're logged in:
```bash
npx wrangler login
```

### Check database exists:
```bash
npx wrangler d1 list
```

### Check migration file exists:
```bash
ls migrations/
# Should show: 0001_initial_schema.sql
```

## One-Line Fix

```bash
cd backend && npm run deploy && npm run migrate && npm test
```

This will:
1. Deploy backend code
2. Create database tables
3. Test everything

## Still Not Working?

1. **Check Cloudflare Dashboard:**
   - Workers & Pages → Your worker
   - D1 → Your database
   - Look for errors

2. **Check logs:**
   ```bash
   npx wrangler tail
   ```

3. **Verify tables:**
   ```bash
   npx wrangler d1 execute growl-db --command "SELECT name FROM sqlite_master WHERE type='table';"
   ```

## Summary

**The backend code is fine.** You just need to run migrations to create the database tables. That's it!
