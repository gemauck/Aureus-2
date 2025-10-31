#!/bin/bash

# Script to add leads with password prompt
echo "🚀 Adding leads to database..."
echo ""
echo "📋 Connection details:"
echo "   Host: dbaas-db-6934625-do-user-28031752-0.f.db.ondigitalocean.com"
echo "   Port: 25060"
echo "   Database: defaultdb"
echo "   Username: doadmin"
echo ""

# Prompt for password
read -sp "Enter database password: " DB_PASSWORD
echo ""

# Build connection string
CONNECTION_STRING="postgresql://doadmin:${DB_PASSWORD}@dbaas-db-6934625-do-user-28031752-0.f.db.ondigitalocean.com:25060/defaultdb?sslmode=require"

echo "🔍 Testing connection..."
if psql "$CONNECTION_STRING" -c "SELECT 1" > /dev/null 2>&1; then
    echo "✅ Database connection successful!"
    echo ""
    echo "📥 Running SQL script to add leads..."
    
    # Run the SQL script
    if psql "$CONNECTION_STRING" -f "add-leads-simple.sql"; then
        echo ""
        echo "✅ Successfully added all leads!"
        echo ""
        echo "📊 Summary:"
        psql "$CONNECTION_STRING" -c "SELECT COUNT(*) as total_leads FROM \"Client\" WHERE type = 'lead';"
    else
        echo ""
        echo "❌ Error running SQL script"
        exit 1
    fi
else
    echo "❌ Failed to connect to database"
    echo "   Please check your password and try again"
    exit 1
fi

