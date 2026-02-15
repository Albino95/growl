# Seed Products - Simple Method

## Overview

The marketplace is accessible to **all users** - they can browse and purchase products without needing a business account. Only **creating** products requires a business account.

## Quick Seed (No Business User Needed)

Simply run the SQL seed script - it will create products that any user can view and buy:

```bash
cd backend
npx wrangler d1 execute growl-db --file=scripts/seed-products-sql.sql --remote
```

This script:
- ✅ Creates products that all users can see
- ✅ Works without any business users
- ✅ Uses a system user for product ownership
- ✅ Any regular user can browse and purchase

## Verify Products

```bash
# Check products were created
npx wrangler d1 execute growl-db --command "SELECT COUNT(*) as count FROM products;" --remote

# List products
npx wrangler d1 execute growl-db --command "SELECT id, name, price, stock FROM products LIMIT 10;" --remote
```

## How It Works

1. **Viewing products**: Open to all users (no authentication required)
2. **Purchasing products**: Any logged-in user can create orders
3. **Creating products**: Requires business account (via API only)

The SQL script bypasses the API business check and creates products directly in the database, so you don't need to mark any user as business.

## Next Steps

After seeding:
1. Refresh the marketplace in your app
2. Products should appear
3. Any user can browse and checkout
