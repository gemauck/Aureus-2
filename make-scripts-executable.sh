#!/bin/bash

# Make all migration scripts executable

chmod +x setup-vite-projects.sh
chmod +x migrate-to-modern-react.sh
chmod +x rebuild-tracker-fix.sh

echo "✅ All migration scripts are now executable"
echo ""
echo "Choose your path:"
echo ""
echo "Option 1: Migrate ONLY Projects to Vite (Recommended)"
echo "  ./setup-vite-projects.sh"
echo "  Time: 1.5 hours"
echo "  Risk: LOW (old system untouched)"
echo ""
echo "Option 2: Migrate ENTIRE app to Vite"
echo "  ./migrate-to-modern-react.sh"
echo "  Time: 8-12 hours"
echo "  Risk: LOW (old files stay, new in frontend/)"
echo ""
echo "Option 3: Quick fix only (keep current system)"
echo "  npm run build:jsx"
echo "  Time: 2 minutes"
echo "  Risk: ZERO (just rebuilds component)"
echo ""
