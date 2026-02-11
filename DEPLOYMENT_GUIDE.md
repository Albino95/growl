# Complete Deployment Guide

This is a quick reference guide for deploying the Growl app. For detailed instructions, see the specific guides.

## 📋 Quick Reference

### Backend (Cloudflare Workers)
- **Status**: ✅ Already deployed
- **URL**: `https://growl-backend.albino-ndreu.workers.dev`
- **Deploy**: `cd backend && npm run deploy`
- **Migrations**: `cd backend && npm run migrate`

### Frontend Web (Vercel)
- **Guide**: See [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md)
- **Quick Deploy**: `cd frontend && vercel --prod`

### Frontend Mobile (Expo)
- **iOS**: `cd frontend && eas build --platform ios`
- **Android**: `cd frontend && eas build --platform android`

## 🚀 Deployment Workflow

### 1. Push Code to Git

```bash
# Commit all changes
git add .
git commit -m "Your commit message"
git push origin main
```

### 2. Deploy Backend (if changed)

```bash
cd backend
npm run deploy
```

### 3. Deploy Frontend Web (Vercel)

Vercel automatically deploys on push, or manually:
```bash
cd frontend
vercel --prod
```

## 📝 Environment Variables

### Backend (Cloudflare)
- Set via `wrangler.toml` or `wrangler secret put`
- See `config/ENVIRONMENT_VARIABLES.md`

### Frontend (Vercel)
- Set in Vercel Dashboard → Project Settings → Environment Variables
- Required: `EXPO_PUBLIC_API_BASE_URL`

## 🔗 Links

- **Backend API**: https://growl-backend.albino-ndreu.workers.dev/api/v1
- **Health Check**: https://growl-backend.albino-ndreu.workers.dev/api/v1/health
- **Vercel Dashboard**: https://vercel.com/dashboard

## 📖 Full Guides

- **Getting Started**: [GETTING_STARTED.md](./GETTING_STARTED.md)
- **Vercel Deployment**: [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md)
- **Backend Setup**: [backend/QUICK_START.md](./backend/QUICK_START.md)
