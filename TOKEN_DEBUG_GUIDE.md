# Token Debugging Guide

## Current Status

✅ **Frontend Token Generation**: Correct
- Format: `header.payload.demo-signature`
- Example: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkZW1vLXVzZXIiLCJpYXQiOjE3MDk4NzY1MjAsImV4cCI6MTcxMDQ4MTMyMH0.demo-signature`

✅ **Backend Token Validation**: Correct
- Checks for `Authorization: Bearer <token>` header
- Splits token into 3 parts
- Decodes payload to get `userId`
- Checks if signature === `"demo-signature"`
- Returns userId if valid

✅ **Demo User Creation**: Correct
- Creates minimal user object if demo account not in DB
- Works for: `demo-user`, `demo-instructor`, `demo-business`, `dev`

## How to Debug Issues

### 1. Check Browser Console

When you make a request, you should see:
```
[Auth] Authorization header present: true
[Auth] Token received, length: XXX
[Auth] Token parts count: 3
[Auth] Decoding payload...
[Auth] Token decoded successfully
[Auth] - userId: demo-user
[Auth] - signature: demo-signature
[Auth] ✅ Demo token detected for user: demo-user
```

### 2. Check Network Tab

1. Open DevTools → Network tab
2. Make a request (e.g., create post)
3. Click on the request
4. Check **Request Headers**:
   ```
   Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkZW1vLXVzZXIiLCJpYXQiOjE3MDk4NzY1MjAsImV4cCI6MTcxMDQ4MTMyMH0.demo-signature
   ```

### 3. Check Cloudflare Logs

1. Go to: https://dash.cloudflare.com
2. Workers → growl-backend → Logs
3. Filter for `[Auth]`
4. Look for the authentication flow

### 4. Test Token Format Manually

Open browser console and run:
```javascript
// Decode your token
const token = localStorage.getItem('auth_token') || 'YOUR_TOKEN_HERE';
const parts = token.split('.');
console.log('Parts:', parts.length);
console.log('Header:', JSON.parse(atob(parts[0])));
console.log('Payload:', JSON.parse(atob(parts[1])));
console.log('Signature:', parts[2]);
console.log('Is demo token?', parts[2] === 'demo-signature');
```

### 5. Common Issues

#### Issue: "401 Unauthorized"
**Possible Causes:**
1. Token not being sent in request
   - Check Network tab → Request Headers → Authorization
   - Should start with `Bearer `
2. Token format incorrect
   - Should have 3 parts separated by `.`
   - Signature should be exactly `demo-signature`
3. Token expired (unlikely for demo tokens, but check payload.exp)

#### Issue: "User not found"
**Possible Causes:**
1. Demo user creation failing
   - Check Cloudflare logs for `[Auth] Created demo user object`
2. Environment variable not set
   - Should be `ENVIRONMENT = "development"` in wrangler.toml

#### Issue: Token not in SecureStore
**Possible Causes:**
1. Sign in failed silently
   - Check browser console for `[Auth]` logs
2. SecureStore not working on web
   - On web, uses localStorage as fallback
   - Check localStorage in DevTools

## Verification Steps

1. **Sign in with demo account**
   - Email: `demo@growl.app`
   - Password: `demo123`
   - Check console for: `[Auth] Demo account signed in`

2. **Check token storage**
   - Console should show: `[Auth] Token stored in SecureStore and tokenManager`
   - Check localStorage: `localStorage.getItem('auth_token')`

3. **Make a request**
   - Try creating a post
   - Check Network tab for Authorization header
   - Check Cloudflare logs for `[Auth]` messages

4. **Verify token format**
   - Token should have 3 parts
   - Last part should be `demo-signature`
   - Payload should contain `userId`

## Expected Flow

1. **Frontend**: User signs in → Token generated → Stored in SecureStore/tokenManager
2. **Frontend**: Request made → Token retrieved from tokenManager → Added to Authorization header
3. **Backend**: Request received → Token extracted → Validated → User ID extracted
4. **Backend**: User looked up in DB → If not found and demo account → Create minimal user object
5. **Backend**: Request processed with user context

## Next Steps if Still Failing

1. Share the exact error message
2. Share Cloudflare logs (filtered for `[Auth]`)
3. Share Network tab screenshot showing request headers
4. Share browser console logs
