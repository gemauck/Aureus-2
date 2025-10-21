#!/bin/bash

# Users Section Diagnostic Script
# This script helps diagnose issues with the Users section

echo "🔍 Abcotronics ERP - Users Section Diagnostic"
echo "=============================================="
echo ""

# Check if server is running
echo "1. Checking if server is running..."
if curl -s http://localhost:3001/api/users > /dev/null 2>&1; then
    echo "✅ Server is running and API is accessible"
else
    echo "❌ Server is not running or API is not accessible"
    echo "   Please start the server with: npm start"
    echo ""
fi

# Check if files exist
echo ""
echo "2. Checking required files..."
files=(
    "src/components/users/UserManagement.jsx"
    "src/utils/permissions.js"
    "api/users/index.js"
    "api/users/invite.js"
    "api/users/accept-invitation.js"
    "api/users/validate-invitation.js"
    "accept-invitation.html"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file exists"
    else
        echo "❌ $file is missing"
    fi
done

# Check if UserManagement is loaded in index.html
echo ""
echo "3. Checking index.html configuration..."
if grep -q "UserManagement.jsx" index.html; then
    echo "✅ UserManagement component is loaded in index.html"
else
    echo "❌ UserManagement component is NOT loaded in index.html"
fi

if grep -q "permissions.js" index.html; then
    echo "✅ Permission system is loaded in index.html"
else
    echo "❌ Permission system is NOT loaded in index.html"
fi

# Check database connection
echo ""
echo "4. Checking database connection..."
if [ -f "prisma/schema.prisma" ]; then
    echo "✅ Prisma schema exists"
    if grep -q "model User" prisma/schema.prisma; then
        echo "✅ User model exists in schema"
    else
        echo "❌ User model missing from schema"
    fi
    if grep -q "model Invitation" prisma/schema.prisma; then
        echo "✅ Invitation model exists in schema"
    else
        echo "❌ Invitation model missing from schema"
    fi
else
    echo "❌ Prisma schema not found"
fi

echo ""
echo "5. Quick fixes to try:"
echo "   • Restart the server: npm start"
echo "   • Clear browser cache and reload"
echo "   • Check browser console for JavaScript errors"
echo "   • Verify you're logged in as an admin user"
echo "   • Open users-section-test.html to run diagnostics"

echo ""
echo "6. Test URLs:"
echo "   • Main ERP: http://localhost:3001"
echo "   • Users Test: http://localhost:3001/users-section-test.html"
echo "   • Full Test Suite: http://localhost:3001/user-management-test.html"
echo "   • Accept Invitation: http://localhost:3001/accept-invitation.html"

echo ""
echo "Diagnostic complete! 🎯"
