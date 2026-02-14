# Running Database Migrations

## Issue
The test results show: `"Error: D1_ERROR: no such table: users: SQLITE_ERROR"`

This means the database tables haven't been created yet. You need to run the migrations.

## Solution

Run the following command in your terminal:

```bash
cd backend
npm run migrate
```

This will:
1. Connect to your Cloudflare D1 database
2. Run the migration file `migrations/0001_initial_schema.sql`
3. Create all necessary tables (users, posts, products, orders, etc.)

## Verify Migration Success

After running migrations, verify by running the tests again:

```bash
npm test
```

You should see:
- ✅ Sign Up test passing
- ✅ Sign In test passing
- ✅ Other tests passing (or at least not failing due to missing tables)

## Troubleshooting

### If migration fails with permission errors:
1. Make sure you're logged into Cloudflare:
   ```bash
   npm run login
   ```

2. Check your `wrangler.toml` has the correct database ID

3. Try running with explicit environment:
   ```bash
   npx wrangler d1 migrations apply growl-db --env production
   ```

### Check if tables exist:
```bash
npx wrangler d1 execute growl-db --command "SELECT name FROM sqlite_master WHERE type='table';"
```

This should show all your tables: users, posts, products, orders, etc.

## What Gets Created

The migration creates:
- `users` - User accounts
- `posts` - Social media posts
- `post_likes` - Post likes
- `post_comments` - Post comments
- `products` - Marketplace products
- `orders` - User orders
- `order_items` - Order line items
- `instructors` - Instructor profiles
- `instructor_votes` - Instructor votes
- `businesses` - Business profiles
- `conversations` - Direct messages
- `messages` - Individual messages
