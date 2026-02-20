# Seed Products Guide

This guide explains how to seed products into your database.

## Option 1: Using SQL Script (Recommended)

The easiest way is to use the SQL script directly:

```bash
cd backend
npx wrangler d1 execute growl-db --remote --file=scripts/seed-products-enhanced.sql
```

This will:
- Create a system user for products (if not exists)
- Insert 30+ products across all categories (fitness, art, music, mindset, cooking, reading, travel)

## Option 2: Using Node.js Script

If you prefer using the Node.js script:

```bash
cd backend
node scripts/seed-products.js
```

**Note:** This script requires:
- A business user account (to create products)
- An auth token (optional, set `AUTH_TOKEN` environment variable)

To use with authentication:
```bash
cd backend
AUTH_TOKEN=your-business-user-token node scripts/seed-products.js
```

## Option 3: Manual SQL Execution

You can also copy the SQL from `scripts/seed-products-enhanced.sql` and execute it directly in your database.

## Products Included

The seed script includes products in these categories:

- **Fitness** (5 products): Yoga mats, resistance bands, protein powder, fitness trackers, dumbbells
- **Art** (4 products): Paint sets, sketchbooks, drawing tablets, watercolors
- **Music** (4 products): Guitars, keyboards, microphones, drum pads
- **Mindset** (4 products): Meditation cushions, diffusers, journals, weighted blankets
- **Cooking** (4 products): Knife sets, stand mixers, meal prep containers, air fryers
- **Reading** (4 products): E-readers, reading lights, language courses, book stands
- **Travel** (4 products): Backpacks, hiking boots, water filters, gardening tools

**Total: 30+ products**

## Verifying Products

After seeding, you can verify products were created:

```bash
cd backend
node scripts/check-products.js
```

Or check via the API:
```bash
curl https://growl-backend.albino-ndreu.workers.dev/api/v1/marketplace/products
```

## Notes

- Products are created with a system user (`system-user-products`)
- All products have proper categories and subcategories
- Images will be automatically generated based on category using the image utilities
- Products have realistic prices, stock levels, and descriptions
