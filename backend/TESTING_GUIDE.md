# Backend Testing Guide

Complete guide for testing the Growl backend API.

## 🚀 Quick Start

### Option 1: Run Automated Test Script

```bash
cd backend
npm test
```

This runs comprehensive tests against the production backend.

### Option 2: Test Against Local Server

1. Start local server:
```bash
cd backend
npm run dev
```

2. Run tests:
```bash
npm run test:local
```

### Option 3: Quick Shell Test

```bash
cd backend/tests
./quick-test.sh
```

Or if you have `jq` installed:
```bash
bash tests/quick-test.sh
```

## 📮 Postman Collection

### Import Collection

1. Open **Postman** (download from [postman.com](https://www.postman.com/downloads/))
2. Click **Import** button
3. Select `backend/tests/postman-collection.json`
4. Collection will be imported with all endpoints

### Using Postman

1. **Set Base URL** (if needed):
   - Click on collection name
   - Go to **Variables** tab
   - Update `base_url` if your backend URL is different

2. **Test Flow**:
   - Start with **Health Check** → Verify backend is running
   - **Sign Up** → Creates account and auto-saves token
   - **Sign In** → Alternative way to get token
   - Use authenticated endpoints (Feed, Create Post, etc.)

3. **Auto Token Management**:
   - Sign Up/Sign In automatically save token to `{{auth_token}}`
   - All authenticated requests use this token automatically

## 🔧 Manual Testing with cURL

### 1. Health Check
```bash
curl https://growl-backend.albino-ndreu.workers.dev/api/v1/health
```

Expected response:
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "...",
    "environment": "development",
    "database": "connected",
    "kv": "connected"
  }
}
```

### 2. Sign Up
```bash
curl -X POST https://growl-backend.albino-ndreu.workers.dev/api/v1/auth/sign-up \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123!",
    "username": "testuser"
  }'
```

Save the `token` from the response for authenticated requests.

### 3. Sign In
```bash
curl -X POST https://growl-backend.albino-ndreu.workers.dev/api/v1/auth/sign-in \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123!"
  }'
```

### 4. Get Feed (Authenticated)
```bash
curl https://growl-backend.albino-ndreu.workers.dev/api/v1/feed/feed \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 5. Create Post (Authenticated)
```bash
curl -X POST https://growl-backend.albino-ndreu.workers.dev/api/v1/feed/posts \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "caption": "My first post!",
    "category": "fitness",
    "subcategory": "losing-weight",
    "image_url": "https://images.unsplash.com/photo-1571019613454-1cb2f99b84d4?w=800&h=600&fit=crop"
  }'
```

### 6. Get Products
```bash
curl https://growl-backend.albino-ndreu.workers.dev/api/v1/marketplace/products
```

### 7. Get Instructors
```bash
curl https://growl-backend.albino-ndreu.workers.dev/api/v1/instructor/instructors
```

## 📊 Test Script Output

The automated test script (`test-api.js`) tests:

- ✅ Health Check
- ✅ Sign Up
- ✅ Sign In  
- ✅ Create Post
- ✅ Get Feed
- ✅ Get Post
- ✅ Like Post
- ✅ Get Products
- ✅ Get Instructors
- ✅ Get Profile
- ✅ Unauthorized Access

It provides a summary at the end:
```
📊 Test Summary
✅ Passed: 10
❌ Failed: 0
📈 Total: 10
```

## 🐛 Troubleshooting

### Connection Errors
- Verify backend URL is correct
- Check if backend is deployed: `curl https://growl-backend.albino-ndreu.workers.dev/api/v1/health`
- Check your internet connection

### 401 Unauthorized
- Make sure you've signed up/signed in first
- Verify token is in Authorization header: `Bearer YOUR_TOKEN`
- Token format: `Bearer <token>` (with space)

### 404 Not Found
- Check endpoint path matches exactly
- Verify API version: `/api/v1/...`
- Check route exists in `backend/src/index.ts`

### 500 Internal Server Error
- Check backend logs: `npx wrangler tail`
- Verify database migrations ran: `npm run migrate`
- Check database connection in health endpoint

### Database Errors
- Run migrations: `npm run migrate`
- Verify database exists: `npx wrangler d1 list`
- Check database connection in health endpoint response

## 📝 Test Data

The test script creates unique test users:
- Email: `test-{timestamp}@example.com`
- Password: `TestPassword123!`
- Username: `testuser`

Each test run creates new users, so you can run tests multiple times.

## 🔗 Useful Links

- **Backend URL**: https://growl-backend.albino-ndreu.workers.dev/api/v1
- **Health Check**: https://growl-backend.albino-ndreu.workers.dev/api/v1/health
- **Postman**: https://www.postman.com/downloads/
- **Cloudflare Dashboard**: https://dash.cloudflare.com/

## 📚 Next Steps

After testing:
1. Review test results
2. Check any failed endpoints
3. Verify database has test data
4. Test from frontend app
5. Monitor backend logs: `npx wrangler tail`
