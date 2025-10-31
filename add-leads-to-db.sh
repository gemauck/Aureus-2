#!/bin/bash

# Script to add leads to PostgreSQL database
# Usage: ./add-leads-to-db.sh [connection_string]

echo "🚀 Adding leads to database..."
echo ""

# Check if connection string provided as argument
if [ -z "$1" ]; then
    echo "📋 Usage: ./add-leads-to-db.sh 'postgresql://user:password@host:port/database?sslmode=require'"
    echo ""
    echo "💡 To get your connection string:"
    echo "   1. Go to: https://cloud.digitalocean.com/databases"
    echo "   2. Click on your PostgreSQL database"
    echo "   3. Go to 'Users & Databases' tab"
    echo "   4. Copy the 'Connection String'"
    echo ""
    echo "   Your host is: dbaas-db-6934625-do-user-28031752-0.f.db.ondigitalocean.com"
    echo "   Format should be: postgresql://doadmin:PASSWORD@dbaas-db-6934625-do-user-28031752-0.f.db.ondigitalocean.com:25060/defaultdb?sslmode=require"
    echo ""
    
    # Try to get from .env file if it exists
    if [ -f .env ]; then
        echo "🔍 Checking .env file for DATABASE_URL..."
        DB_URL=$(grep "^DATABASE_URL=" .env | cut -d '=' -f2- | tr -d '"' | tr -d "'")
        
        if [ -z "$DB_URL" ]; then
            echo "❌ DATABASE_URL not found in .env file"
            exit 1
        fi
        
        # Check if it's a PostgreSQL URL
        if [[ ! "$DB_URL" =~ ^postgresql:// ]] && [[ ! "$DB_URL" =~ ^postgres:// ]]; then
            echo "❌ DATABASE_URL in .env is not a PostgreSQL connection string"
            echo "   Current value starts with: $(echo $DB_URL | cut -c1-20)..."
            echo ""
            echo "   You need to update your .env file with the PostgreSQL connection string."
            exit 1
        fi
        
        echo "✅ Found DATABASE_URL in .env file"
        CONNECTION_STRING="$DB_URL"
    else
        echo "❌ No connection string provided and no .env file found"
        exit 1
    fi
else
    CONNECTION_STRING="$1"
fi

# Check if SQL file exists
SQL_FILE="add-leads-simple.sql"
if [ ! -f "$SQL_FILE" ]; then
    echo "❌ SQL file not found: $SQL_FILE"
    exit 1
fi

echo "📝 Using connection string: ${CONNECTION_STRING:0:30}..." # Show first 30 chars only
echo ""
echo "🔍 Testing connection..."
if psql "$CONNECTION_STRING" -c "SELECT 1" > /dev/null 2>&1; then
    echo "✅ Database connection successful!"
    echo ""
    echo "📥 Running SQL script to add leads..."
    
    # Run the SQL script
    if psql "$CONNECTION_STRING" -f "$SQL_FILE"; then
        echo ""
        echo "✅ Successfully added all leads!"
        echo ""
        echo "📊 Verifying leads were added..."
        psql "$CONNECTION_STRING" -c "SELECT COUNT(*) as total_leads FROM \"Client\" WHERE type = 'lead';"
    else
        echo ""
        echo "❌ Error running SQL script"
        exit 1
    fi
else
    echo "❌ Failed to connect to database"
    echo ""
    echo "💡 Check your connection string format:"
    echo "   postgresql://username:password@host:port/database?sslmode=require"
    exit 1
fi

