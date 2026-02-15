# Backend Documentation

Cloudflare Workers backend for the Growl app.

## Quick Start

### Prerequisites
- Node.js 20+
- Cloudflare account
- Wrangler CLI: `npm install -g wrangler`

### Setup

```bash
# Install dependencies
npm install

# Login to Cloudflare
npx wrangler login

# Run migrations
npm run migrate

# Deploy
npm run deploy
```

## Technology Stack

- **Cloudflare Workers** - Serverless functions
- **Cloudflare D1** - SQLite database
- **Cloudflare R2** - Object storage
- **Cloudflare KV** - Key-value store
- **TypeScript** - Type safety

## Documentation

- **[BACKEND_ARCHITECTURE.md](./BACKEND_ARCHITECTURE.md)** - Complete architecture and API design
- **[ERD.md](./ERD.md)** - Database Entity Relationship Diagram
- **[SEED_PRODUCTS_SIMPLE.md](./SEED_PRODUCTS_SIMPLE.md)** - Seed marketplace products
- **[tests/README.md](./tests/README.md)** - Testing guide

## API Endpoints

Base URL: `https://growl-backend.albino-ndreu.workers.dev/api/v1`

- `GET /health` - Health check
- `POST /auth/sign-up` - User registration
- `POST /auth/sign-in` - User login
- `GET /marketplace/products` - List products
- `GET /marketplace/products/:id` - Get product details
- `POST /marketplace/orders` - Create order

See `BACKEND_ARCHITECTURE.md` for complete API documentation.

## Development

```bash
# Run locally
npm run dev

# Run tests
npm test

# Run migrations
npm run migrate
```

