#!/bin/bash

# Quick script to regenerate Prisma and test templates

echo "🔄 Regenerating Prisma Client..."
npx prisma generate

echo ""
echo "🧪 Testing templates API..."
node test-templates-api.js

echo ""
echo "✅ If templates are found above, the API should work."
echo ""
echo "📋 Next steps:"
echo "   1. If running locally: Restart your dev server (Ctrl+C and run 'npm run dev' again)"
echo "   2. If on production server: SSH and run 'pm2 restart abcotronics-erp'"
echo "   3. Clear browser cache or do a hard refresh (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows)"
echo "   4. Open the Weekly FMS Review Tracker and check Template Management"













