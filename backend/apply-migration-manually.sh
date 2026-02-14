#!/bin/bash

# Manual Migration Script
# This applies the migration SQL directly to the database

echo "🔧 Applying migration manually..."

# Read the migration file and apply it
SQL_FILE="migrations/0001_initial_schema.sql"

if [ ! -f "$SQL_FILE" ]; then
    echo "❌ Migration file not found: $SQL_FILE"
    exit 1
fi

echo "📄 Reading migration file: $SQL_FILE"
echo ""

# Apply the migration
echo "🚀 Applying migration to growl-db..."
npx wrangler d1 execute growl-db --file="$SQL_FILE"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration applied successfully!"
    echo ""
    echo "🔍 Verifying tables were created..."
    npx wrangler d1 execute growl-db --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
else
    echo ""
    echo "❌ Migration failed. Check the error above."
    exit 1
fi
