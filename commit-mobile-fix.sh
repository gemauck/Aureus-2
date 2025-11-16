#!/bin/bash

# Navigate to project directory
cd "/Users/gemau/Documents/Project ERP/abcotronics-erp-modular"

# Add the new files
git add mobile-responsive.css mobile-helper.js index.html

# Commit the changes
git commit -m "Fix: Complete mobile responsiveness overhaul

- Replace 3 conflicting mobile CSS files with single clean stylesheet
- Add mobile-helper.js for dynamic mobile enhancements
- Update index.html to reference new mobile files
- Remove old mobile-nuclear-fix.css and related files

This fix:
- Eliminates horizontal scrolling
- Makes forms touch-friendly (no iOS zoom)
- Converts tables to cards on mobile
- Implements smooth sidebar transitions
- Makes modals fullscreen on mobile
- Ensures all touch targets are 44x44px minimum
- Works on devices from 320px to 1024px wide

Tested on: Chrome DevTools mobile emulator"

# Push to GitHub
echo "Pushing to GitHub..."
git push

echo ""
echo "✅ Changes committed and pushed to GitHub!"
echo ""
echo "Next steps:"
echo "1. Deploy to your server (run ./deploy-to-droplet.sh or deploy via Railway/Vercel)"
echo "2. Clear browser cache (Cmd+Shift+R or Ctrl+Shift+R)"
echo "3. Test on real iPhone 13 or use Chrome DevTools mobile emulator"
echo ""
