#!/bin/bash

# Backend Fix Script
# This script will deploy the backend and run migrations

set -e  # Exit on error

echo "🔧 Backend Fix Script"
echo "===================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Check if we're in the right directory
if [ ! -f "wrangler.toml" ]; then
    echo -e "${RED}❌ Error: wrangler.toml not found. Please run this from the backend directory.${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 1: Checking Cloudflare login...${NC}"
if ! npx wrangler whoami > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Not logged in. Please login to Cloudflare:${NC}"
    npx wrangler login
else
    echo -e "${GREEN}✅ Logged in to Cloudflare${NC}"
fi

echo ""
echo -e "${YELLOW}Step 2: Deploying backend...${NC}"
npm run deploy
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Backend deployed successfully${NC}"
else
    echo -e "${RED}❌ Deployment failed${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Step 3: Running database migrations...${NC}"
npm run migrate
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Migrations completed successfully${NC}"
else
    echo -e "${RED}❌ Migrations failed${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Step 4: Verifying tables were created...${NC}"
TABLES=$(npx wrangler d1 execute growl-db --command "SELECT name FROM sqlite_master WHERE type='table';" 2>/dev/null | grep -c "users" || echo "0")
if [ "$TABLES" -gt 0 ]; then
    echo -e "${GREEN}✅ Tables created successfully${NC}"
else
    echo -e "${YELLOW}⚠️  Could not verify tables. Please check manually.${NC}"
fi

echo ""
echo -e "${YELLOW}Step 5: Running tests...${NC}"
npm test

echo ""
echo -e "${GREEN}✅ Backend fix complete!${NC}"
echo ""
echo "If tests still fail, check:"
echo "  1. Database migrations ran successfully"
echo "  2. Backend is deployed with latest code"
echo "  3. Check Cloudflare dashboard for errors"
