# Debugging Guide - Auth Issues

## Current Issues
1. **Sign Out**: Nothing happens when clicking sign out (no console logs)
2. **401 Unauthorized**: Getting 401 errors on posts and feed, even though token is being sent

## Database Tables Status

✅ **All Required Tables Exist:**
- `users` ✅
- `posts` ✅
- `post_engagement` ✅
- `products` ✅
- `orders` ✅
- `order_items` ✅
- `stories` ✅
- `story_views` ✅
- `user_relationships` ✅
- `instructor_votes` ✅
- `journal_entries` ✅
- `reports` ✅

**No migration needed** - All tables are present.

## Sign Out Issue

### Current Behavior
- Sign out button doesn't trigger any console logs
- No network requests made (sign out is client-side only)

### Expected Flow
1. User clicks "Sign Out"
2. `window.confirm()` shows on web (or `Alert.alert()` on native)
3. If confirmed, `signOut()` is called
4. Redux thunk clears SecureStore and tokenManager
5. Redux state is cleared
6. Navigation resets to Auth screen

### Debugging Steps
1. **Check if button is clickable:**
   - Open browser DevTools
   - Check if sign out button is visible and not disabled
   - Try clicking it and see if `window.confirm` appears

2. **Check console for logs:**
   - Look for `[ProfileScreen] ===== SIGN OUT STARTED =====`
   - If not present, the button click isn't working

3. **Check if function is bound:**
   - Verify `onPress={handleSignOut}` is on the sign out button

## 401 Unauthorized Issue

### Current Behavior
- Token is being sent: `Authorization: Bearer <token>`
- Token format is correct: JWT format (3 parts)
- Backend returns 401: "Authentication required"

### Root Cause Analysis

The backend logs will now show:
- `[Auth] Authorization header present: true/false`
- `[Auth] Token received, length: X`
- `[Auth] Token parts count: 3`
- `[Auth] Token decoded successfully`
- `[Auth] - userId: demo-user`
- `[Auth] - signature: demo-signature`
- `[Auth] - isDemoToken: true`
- `[Auth] ✅ Demo token detected`
- `[Auth] Fetching user from database`
- `[Auth] User found in DB: false`
- `[Auth] Is demo account: true`
- `[Auth] ✅ Demo user not in DB, creating minimal user object`

### What to Check

1. **Backend Logs** (Cloudflare Workers Dashboard):
   - Go to: https://dash.cloudflare.com
   - Navigate to Workers → growl-backend
   - Check "Logs" tab
   - Look for `[Auth]` prefixed logs

2. **Token Format**:
   - Should be: `header.payload.signature`
   - Signature should be: `demo-signature`
   - Payload should contain: `{"userId": "demo-user", ...}`

3. **User ID in Token**:
   - Check what `userId` is in the token payload
   - Should match: `demo-user`, `demo-instructor`, `demo-business`, or `dev`

## Testing Steps

### Test Sign Out
1. Open browser console
2. Click "Sign Out" button
3. Check for:
   - `window.confirm` dialog appears
   - Console logs starting with `[ProfileScreen]`
   - Console logs starting with `[Auth]`
   - Navigation to Auth screen

### Test Post Creation
1. Open browser console
2. Try to create a post
3. Check Network tab:
   - Request URL: `https://growl-backend.albino-ndreu.workers.dev/api/v1/feed/posts`
   - Request Method: `POST`
   - Request Headers: Should have `Authorization: Bearer <token>`
   - Response Status: Should be 201 (not 401)
4. Check console for `[Auth]` logs from backend

## Quick Fixes

### If Sign Out Still Doesn't Work
The button might not be triggering. Check:
```tsx
// In ProfileScreen.tsx, find the sign out button
<TouchableOpacity onPress={handleSignOut}>
  <Text>Sign Out</Text>
</TouchableOpacity>
```

### If 401 Persists
1. Check Cloudflare Workers logs for backend `[Auth]` logs
2. Verify token signature is exactly `demo-signature`
3. Check if userId in token matches expected format

## Next Steps

After backend is redeployed with new logging:
1. Try posting again
2. Check Cloudflare Workers logs
3. Share the backend logs so we can see exactly where it's failing
