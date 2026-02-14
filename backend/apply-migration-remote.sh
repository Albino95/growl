#!/bin/bash

# Apply migration to REMOTE database

echo "🚀 Applying migration to REMOTE database..."
echo ""

npx wrangler d1 execute growl-db --file=migrations/0001_initial_schema.sql --remote

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration applied successfully to remote database!"
    echo ""
    echo "🔍 Verifying tables..."
    npx wrangler d1 execute growl-db --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;" --remote
    echo ""
    echo "✅ Done! Run 'npm test' to verify."
else
    echo ""
    echo "❌ Migration failed. Check the error above."
    exit 1
fi
