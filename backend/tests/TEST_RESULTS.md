# Backend Test Results

## Quick Test Commands

### Test Production Backend
```bash
cd backend
npm test
```

### Test with Debug Output
```bash
cd backend
DEBUG=1 npm test
```

### Test Local Backend
```bash
# Terminal 1: Start local server
cd backend
npm run dev

# Terminal 2: Run tests
cd backend
npm run test:local
```

## Expected Test Results

### ✅ Should Pass
- Health Check - Verifies backend is running and database is connected
- Unauthorized Access - Verifies authentication is required

### ⚠️ May Fail (if database is empty)
- Get Products - Will pass but return 0 products if none exist
- Get Instructors - Will pass but return 0 instructors if none exist

### 🔐 Requires Authentication
- Sign Up - Creates a new user
- Sign In - Authenticates existing user
- Create Post - Requires auth token
- Get Feed - Requires auth token
- Get Profile - Requires auth token

## Troubleshooting Failed Tests

### Sign Up Fails with "no such table: users"
**This is the most common issue!**

**Cause:** Database migrations haven't been run on the production database.

**Fix:**
```bash
cd backend
npm run migrate
npm test
```

**Note:** The health check passes because it only checks if the database connection works, not if tables exist.

### Sign Up Fails (Other Causes)
**Possible causes:**
- Database connection issue: Check health endpoint
- SQL syntax error: Check backend logs
- User already exists: Try with a different email

**Fix:**
```bash
cd backend
npm run migrate
npm test
```

### Sign In Fails
**Possible causes:**
- User doesn't exist (sign up first)
- Wrong password
- Database issue

**Fix:**
- Make sure sign up test passes first
- Or create a user manually

### Get Feed/Posts Fail
**Possible causes:**
- No auth token (sign up/sign in first)
- Token expired
- Database has no posts

**Fix:**
- Tests run in sequence, so if sign up fails, subsequent tests will fail
- Check that sign up test passes

## Test Output Interpretation

### ✅ PASS
- Test completed successfully
- Endpoint is working correctly

### ❌ FAIL
- Test failed
- Check the error message for details
- Run with `DEBUG=1` for more information

## Manual Verification

If automated tests fail, verify manually:

1. **Health Check:**
   ```bash
   curl https://growl-backend.albino-ndreu.workers.dev/api/v1/health
   ```

2. **Check Database:**
   ```bash
   npx wrangler d1 execute growl-db --command "SELECT COUNT(*) FROM users;"
   ```

3. **Check Logs:**
   ```bash
   npx wrangler tail
   ```
