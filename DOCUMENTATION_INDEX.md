# Documentation Index

This is a quick reference to all essential documentation for the Growl app.

## 📚 Essential Documentation

### Getting Started
- **[README.md](./README.md)** - Project overview and quick start
- **[GETTING_STARTED.md](./GETTING_STARTED.md)** - Complete setup guide for development

### Deployment
- **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** - Quick deployment reference
- **[VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md)** - Detailed Vercel deployment guide

### Backend
- **[backend/README.md](./backend/README.md)** - Backend setup and API overview
- **[backend/BACKEND_ARCHITECTURE.md](./backend/BACKEND_ARCHITECTURE.md)** - Complete architecture documentation
- **[backend/ERD.md](./backend/ERD.md)** - Database Entity Relationship Diagram
- **[backend/SEED_PRODUCTS_SIMPLE.md](./backend/SEED_PRODUCTS_SIMPLE.md)** - How to seed marketplace products
- **[backend/tests/README.md](./backend/tests/README.md)** - Testing guide

### Configuration
- **[config/ENVIRONMENT_VARIABLES.md](./config/ENVIRONMENT_VARIABLES.md)** - Environment variables reference
- **[config/README.md](./config/README.md)** - Configuration folder overview

### Frontend
- **[frontend/README.md](./frontend/README.md)** - Frontend setup (if exists)

### Admin
- **[admin/README.md](./admin/README.md)** - Admin dashboard documentation

## 🛠️ Utility Scripts

### Backend Scripts
- `backend/fix-backend.sh` - Deploy backend and run migrations
- `backend/apply-migration-remote.sh` - Apply migrations to remote database
- `backend/apply-migration-manually.sh` - Apply migrations manually
- `backend/scripts/check-products.js` - Check products in database
- `backend/scripts/seed-products-sql.sql` - SQL script to seed products
- `backend/tests/quick-test.sh` - Quick API connectivity test

## 📖 Quick Reference

### Start Development
```bash
# Frontend
cd frontend && npm install && npm start

# Backend (already deployed)
# Or locally: cd backend && npm run dev
```

### Seed Products
```bash
cd backend
npx wrangler d1 execute growl-db --file=scripts/seed-products-sql.sql --remote
```

### Deploy
```bash
# Backend
cd backend && npm run deploy

# Frontend (Vercel)
cd frontend && vercel --prod
```
