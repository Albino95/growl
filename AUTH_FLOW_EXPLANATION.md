# Authentication Flow Explanation

## Overview
The app uses Redux Toolkit for state management with async thunks for authentication operations. Tokens are stored in multiple places for reliability.

## Storage Locations

1. **Redux Store** (`state.auth.token`) - In-memory state, cleared on app restart
2. **SecureStore** (`auth_token` key) - Persistent storage (localStorage on web, SecureStore on native)
3. **TokenManager** (`tokenManager.ts`) - In-memory cache for fast access from `http.ts`

## Sign In Flow

1. User enters credentials → `signIn` thunk is dispatched
2. Frontend hashes password and calls `/auth/sign-in` endpoint
3. Backend validates and returns JWT token
4. **Token is stored in 3 places:**
   - Redux state: `state.auth.token = token`
   - SecureStore: `setSecureItem('auth_token', token)`
   - TokenManager: `setToken(token)`
5. User data is stored in Redux and SecureStore

## Token Retrieval for API Requests

When `http.ts` makes a request:
1. First checks **TokenManager** (fastest, in-memory)
2. If not found, checks **SecureStore** (persistent)
3. If found in SecureStore, caches it in TokenManager
4. Adds token to `Authorization: Bearer <token>` header

## Sign Out Flow

1. User clicks "Sign Out" → `signOut()` from `useAuth()` hook
2. Dispatches `signOut` async thunk
3. **Clears all 3 storage locations:**
   - Redux: `state.token = null, state.user = null`
   - SecureStore: `deleteSecureItem('auth_token')` and `deleteSecureItem('user_data')`
   - TokenManager: `clearToken()`
4. Navigation resets to Auth screen

## Current Issues

### Issue 1: Sign Out Not Working
**Symptoms:** Clicking sign out does nothing, no console logs

**Possible Causes:**
- `signOut()` function not being called
- Alert dialog not showing
- Navigation reset not working
- Redux thunk not dispatching

**Debug Steps:**
1. Check browser console for `[ProfileScreen] ===== SIGN OUT STARTED =====`
2. Check for `[Auth] Signing out...` logs
3. Check if navigation object exists
4. Verify Redux state is cleared

### Issue 2: Post Creation 401 Unauthorized
**Symptoms:** Getting 401 error when creating posts, token shows as available

**Possible Causes:**
- Token not in correct format (backend expects JWT)
- Token not being sent in Authorization header
- Backend not recognizing demo tokens
- Token expired or invalid

**Debug Steps:**
1. Check `[HTTP] Token available: true/false` in console
2. Check `[HTTP] Token format: JWT format/Invalid format`
3. Check `[HTTP] Authorization header set` log
4. Verify token in Network tab → Request Headers
5. Check backend logs for token validation

## Token Format

Backend expects JWT format: `header.payload.signature`

Example:
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkZW1vLXVzZXIiLCJpYXQiOjE3MTEwMjQ1MzYsImV4cCI6MTcxMTYyOTMzNn0.demo-signature
```

Demo tokens are generated with:
- Header: `{"alg":"HS256","typ":"JWT"}`
- Payload: `{"userId":"demo-user","iat":...,"exp":...}`
- Signature: `demo-signature`

## Debugging Commands

In browser console, you can check:
```javascript
// Check Redux state
window.__REDUX_DEVTOOLS_EXTENSION__ // Open Redux DevTools

// Check localStorage (web)
localStorage.getItem('auth_token')

// Check tokenManager (if accessible)
// Token is in memory, check via Redux state
```

## Files Involved

- `frontend/src/store/slices/authSlice.ts` - Auth Redux slice with thunks
- `frontend/src/services/api/http.ts` - HTTP client that adds auth headers
- `frontend/src/services/storage/tokenManager.ts` - In-memory token cache
- `frontend/src/services/storage/secureStore.ts` - Persistent storage wrapper
- `frontend/src/store/hooks.ts` - `useAuth()` hook
- `frontend/src/screens/Profile/ProfileScreen.tsx` - Sign out UI
- `backend/src/utils/auth.ts` - Backend token validation
