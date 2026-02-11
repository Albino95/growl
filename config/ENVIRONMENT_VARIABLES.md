# Environment Variables & Configuration

## Cloudflare Workers Deployment

**Worker URL:** `https://growl-backend.albino-ndreu.workers.dev`  
**Current Version ID:** `1d4a5fa9-4018-4b48-a03d-0b5f0d30b0ba`  
**Deployment Date:** 2026-02-11

## Bindings & Resources

### D1 Database
- **Binding Name:** `DB`
- **Database Name:** `growl-db`
- **Database ID:** `be2fe4d4-4f8c-474f-ba82-1c083b3cb1ef`

### KV Namespace
- **Binding Name:** `KV`
- **Namespace ID:** `acb4474069c041bd838e3c2f6de54257`
- **Preview ID:** `536de44686804dfaa0f27e5a523b596e`

## Environment Variables

### Development Environment
```bash
ENVIRONMENT="development"
JWT_SECRET="dev-secret-key-change-in-production"
API_VERSION="v1"
```

### Production Environment
⚠️ **IMPORTANT:** Update JWT_SECRET for production using:
```bash
npx wrangler secret put JWT_SECRET
```

## API Endpoints

### Base URL
```
https://growl-backend.albino-ndreu.workers.dev/api/v1
```

### Health Check
```
GET https://growl-backend.albino-ndreu.workers.dev/api/v1/health
```

## Local Development

### Running Locally
```bash
cd backend
npm run dev
```

### Local Database
```bash
npm run migrate:local
```

### Production Database
```bash
npm run migrate
```

## Wrangler Configuration

The full configuration is stored in `backend/wrangler.toml`:

```toml
name = "growl-backend"
main = "src/index.ts"
compatibility_date = "2024-01-15"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "growl-db"
database_id = "be2fe4d4-4f8c-474f-ba82-1c083b3cb1ef"

[[kv_namespaces]]
binding = "KV"
id = "acb4474069c041bd838e3c2f6de54257"
preview_id = "536de44686804dfaa0f27e5a523b596e"

[vars]
ENVIRONMENT = "development"
JWT_SECRET = "dev-secret-key-change-in-production"
API_VERSION = "v1"
```

## Frontend Configuration

### API Base URL
The frontend is configured to use:
```
https://growl-backend.albino-ndreu.workers.dev/api/v1
```

This is set in:
- `frontend/app.config.ts` - Expo config
- `frontend/src/services/api/http.ts` - HTTP client

## Security Notes

⚠️ **WARNING:** The current JWT_SECRET is for development only. For production:
1. Generate a secure random secret
2. Set it using: `npx wrangler secret put JWT_SECRET`
3. Never commit production secrets to version control

## Quick Reference Commands

```bash
# Deploy to Cloudflare
cd backend && npm run deploy

# Run migrations
cd backend && npm run migrate

# Run local development
cd backend && npm run dev

# Check logs
npx wrangler tail

# View database
npx wrangler d1 execute growl-db --command "SELECT name FROM sqlite_master WHERE type='table';"
```
