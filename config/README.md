# Configuration & Environment Variables

This folder contains all deployment configuration, environment variables, and resource bindings for the Growl app.

## Files

- **ENVIRONMENT_VARIABLES.md** - Detailed documentation of all environment variables, bindings, and configuration
- **DEPLOYMENT_INFO.json** - Machine-readable deployment information and resource IDs

## Quick Access

### Worker URL
```
https://growl-backend.albino-ndreu.workers.dev
```

### API Base URL
```
https://growl-backend.albino-ndreu.workers.dev/api/v1
```

### Database
- **Name:** growl-db
- **ID:** be2fe4d4-4f8c-474f-ba82-1c083b3cb1ef

### KV Namespace
- **ID:** acb4474069c041bd838e3c2f6de54257

## Important Notes

⚠️ **Security Warning:** The JWT_SECRET in development is not secure. For production, use:
```bash
npx wrangler secret put JWT_SECRET
```

## Related Files

- `backend/wrangler.toml` - Wrangler configuration file
- `backend/src/index.ts` - Main worker entry point
- `frontend/app.config.ts` - Frontend Expo configuration
- `frontend/src/services/api/http.ts` - API client configuration

## Getting Started

- **Getting Started Guide**: `../GETTING_STARTED.md` - Complete setup instructions
- **Vercel Deployment**: `../VERCEL_DEPLOYMENT.md` - Web deployment guide
- **Deployment Guide**: `../DEPLOYMENT_GUIDE.md` - Quick deployment reference
