#!/bin/bash
echo "🔍 Verifying Guest Role Deployment..."
echo ""

echo "1. Checking source files..."
grep -q "guest:" src/utils/permissions.js && echo "✅ permissions.js has guest role" || echo "❌ guest role missing in permissions.js"
grep -q "guest" src/components/users/Users.jsx && echo "✅ Users.jsx has guest role" || echo "❌ guest role missing in Users.jsx"
grep -q "formData.role === 'guest'" src/components/users/UserModal.jsx && echo "✅ UserModal.jsx has guest logic" || echo "❌ guest logic missing in UserModal.jsx"
grep -q "userRole === 'guest'" src/components/layout/MainLayout.jsx && echo "✅ MainLayout.jsx has guest filtering" || echo "❌ guest filtering missing in MainLayout.jsx"

echo ""
echo "2. Checking API files..."
grep -q "accessibleProjectIds" api/users/index.js && echo "✅ Users API handles accessibleProjectIds" || echo "❌ accessibleProjectIds missing in Users API"
grep -q "userRole === 'guest'" api/projects.js && echo "✅ Projects API filters for guests" || echo "❌ guest filtering missing in Projects API"

echo ""
echo "3. Checking schema..."
grep -q "accessibleProjectIds" prisma/schema.prisma && echo "✅ Schema has accessibleProjectIds" || echo "❌ accessibleProjectIds missing in schema"

echo ""
echo "✅ Verification complete!"
