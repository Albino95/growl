# Getting Started Guide - Growl App

This guide will help you set up and run the Growl application locally and deploy it to production.

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v20.19.4 or higher)
- **npm** or **yarn**
- **Git**
- **Cloudflare account** (for backend deployment)
- **Expo CLI** (optional, but recommended)
- **iOS Simulator** (for Mac users) or **Android Studio** (for Android development)

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd growl_rn_ts_twrnc_sdk54_v5
```

### 2. Backend Setup

The backend runs on Cloudflare Workers. You can either:
- **Use the deployed version** (already running)
- **Run locally** for development

#### Option A: Use Deployed Backend (Recommended)

The backend is already deployed at:
```
https://growl-backend.albino-ndreu.workers.dev
```

No setup needed! The frontend is already configured to use this.

#### Option B: Run Backend Locally

```bash
cd backend

# Install dependencies
npm install

# Login to Cloudflare (first time only)
npm run login

# Run migrations on local database
npm run migrate:local

# Start local development server
npm run dev
```

The local server will run at: `http://localhost:8787`

**Note:** Make sure to update `frontend/app.config.ts` if using local backend:
```typescript
API_BASE_URL: 'http://localhost:8787/api/v1'
```

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start Expo development server
npm start
```

This will:
- Start the Metro bundler
- Open Expo DevTools in your browser
- Show a QR code for testing on physical devices

### 4. Run on Different Platforms

#### iOS Simulator (Mac only)
```bash
npm run ios
```

#### Android Emulator
```bash
npm run android
```

#### Web Browser
```bash
npm run web
```

#### Physical Device
1. Install **Expo Go** app on your phone
2. Scan the QR code shown in the terminal
3. The app will load on your device

## 🔧 Development Workflow

### Backend Development

```bash
cd backend

# Type checking
npm run type-check

# Linting
npm run lint

# Deploy to Cloudflare
npm run deploy

# Run database migrations (production)
npm run migrate
```

### Frontend Development

```bash
cd frontend

# Type checking
npm run typecheck

# Linting
npm run lint

# Format code
npm run format
```

## 📱 Testing the Application

### 1. Health Check

Test if the backend is running:
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

### 2. Test Authentication

1. Open the app on your device/simulator
2. Navigate to the Auth screen
3. Try signing up with a new account
4. Sign in with your credentials

### 3. Test Feed

1. After signing in, you should see the feed
2. Try creating a post
3. Like and comment on posts

## 🗄️ Database Setup

### First Time Setup

If you need to set up the database from scratch:

```bash
cd backend

# Create database (if not exists)
npm run db:create

# Run migrations
npm run migrate
```

### Local Database

For local development:
```bash
npm run migrate:local
```

## 🔐 Environment Variables

### Backend

Environment variables are configured in `backend/wrangler.toml`:
- `ENVIRONMENT`: development/production
- `JWT_SECRET`: Secret key for JWT tokens
- `API_VERSION`: API version (v1)

**For production**, set secrets using:
```bash
npx wrangler secret put JWT_SECRET
```

### Frontend

Frontend configuration is in `frontend/app.config.ts`:
- `API_BASE_URL`: Backend API URL
- `ENV`: Environment (development/production)

## 📚 Project Structure

```
growl_rn_ts_twrnc_sdk54_v5/
├── backend/              # Cloudflare Workers backend
│   ├── src/
│   │   ├── routes/      # API route handlers
│   │   ├── utils/       # Utility functions
│   │   └── index.ts     # Main entry point
│   ├── migrations/      # Database migrations
│   └── wrangler.toml    # Cloudflare configuration
├── frontend/            # React Native app
│   ├── src/
│   │   ├── screens/     # Screen components
│   │   ├── components/  # Reusable components
│   │   ├── services/    # API services
│   │   └── utils/       # Utilities
│   └── app.config.ts    # Expo configuration
└── config/              # Configuration documentation
```

## 🐛 Troubleshooting

### Backend Issues

**Problem:** Database connection fails
```bash
# Check if database exists
npx wrangler d1 list

# Verify migrations ran
npx wrangler d1 execute growl-db --command "SELECT name FROM sqlite_master WHERE type='table';"
```

**Problem:** Worker deployment fails
```bash
# Check Wrangler login
npx wrangler whoami

# Re-login if needed
npm run login
```

### Frontend Issues

**Problem:** Metro bundler won't start
```bash
# Clear cache and restart
npm start -- --clear
```

**Problem:** App won't connect to backend
- Check `frontend/app.config.ts` has correct `API_BASE_URL`
- Verify backend is running and accessible
- Check network connectivity

**Problem:** TypeScript errors
```bash
cd frontend
npm run typecheck
```

## 📖 Additional Documentation

- **Backend Architecture**: `backend/BACKEND_ARCHITECTURE.md`
- **Database ERD**: `backend/ERD.md`
- **Environment Variables**: `config/ENVIRONMENT_VARIABLES.md`
- **Deployment Info**: `config/DEPLOYMENT_INFO.json`
- **Backend Completion**: `BACKEND_COMPLETION_SUMMARY.md`

## 🆘 Need Help?

1. Check the troubleshooting section above
2. Review the documentation files
3. Check Cloudflare Workers logs: `npx wrangler tail`
4. Check Expo logs in the terminal

## ✅ Next Steps

After getting the app running:

1. **Explore the Features**:
   - Feed with personalized content
   - Create posts with images
   - Like and comment
   - Browse marketplace
   - Connect with instructors

2. **Development**:
   - Make changes to the code
   - Test on your device
   - Deploy backend changes: `cd backend && npm run deploy`

3. **Production Deployment**:
   - See `VERCEL_DEPLOYMENT.md` for web deployment
   - See `backend/QUICK_START.md` for backend deployment
