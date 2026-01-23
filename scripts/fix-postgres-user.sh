#!/bin/bash
# Fix PostgreSQL user and create database

echo "🔧 Fixing PostgreSQL user and database setup..."
echo ""

# Try to connect as postgres superuser
echo "Attempting to connect as postgres superuser..."
echo "If this asks for a password, try your system password or leave blank and press Enter"
echo ""

# Try different methods to connect
if sudo -u postgres psql -c "\du" 2>/dev/null | grep -q gemau; then
    echo "✅ User 'gemau' exists in PostgreSQL"
    USER_EXISTS=true
elif psql -U postgres -d postgres -c "\du" 2>/dev/null | grep -q gemau; then
    echo "✅ User 'gemau' exists in PostgreSQL"
    USER_EXISTS=true
else
    echo "⚠️  User 'gemau' not found"
    USER_EXISTS=false
fi

echo ""
echo "Options to proceed:"
echo ""
echo "Option 1: Create database using postgres superuser"
echo "  Run: sudo -u postgres psql"
echo "  Then: CREATE DATABASE abcotronics_erp_local;"
echo "        GRANT ALL PRIVILEGES ON DATABASE abcotronics_erp_local TO gemau;"
echo "        \\q"
echo ""
echo "Option 2: Create gemau user with a known password"
echo "  Run: sudo -u postgres psql"
echo "  Then: CREATE USER gemau WITH PASSWORD 'yourpassword' SUPERUSER;"
echo "        CREATE DATABASE abcotronics_erp_local OWNER gemau;"
echo "        \\q"
echo ""
echo "Option 3: Use your macOS username (might work without password)"
echo "  Run: createdb abcotronics_erp_local"
echo ""

# Try to create database as current macOS user (might work)
echo "Attempting to create database as current user ($USER)..."
if createdb abcotronics_erp_local 2>/dev/null; then
    echo "✅ Database created successfully as user $USER!"
    echo ""
    echo "Update .env.local to use:"
    echo "  DATABASE_URL=\"postgresql://$USER@localhost:5432/abcotronics_erp_local\""
    exit 0
else
    echo "⚠️  Could not create database automatically"
fi

echo ""
echo "Please choose one of the options above to proceed."





