#!/bin/bash

# Deploy session validation fix - redirects to login when session expires after 6+ hours away

set -e

echo "🚀 Deploying session validation fix..."

cd /Users/gemau/Documents/Project\ ERP/abcotronics-erp-modular

# Add changes
git add src/components/auth/AuthProvider.jsx

# Commit
git commit -m "Add session validation on page return - redirect to login after 6hr stale session"

# Push to trigger deployment
git push origin main

echo "✅ Deployed! Changes will be live shortly."
echo ""
echo "What this fix does:"
echo "  - When you return to the page after 6+ hours away, validates your session"
echo "  - If session expired (401/Unauthorized), redirects to login automatically"
echo "  - If server unreachable, warns but keeps you in offline mode"
echo "  - 30-second cooldown prevents spam validation requests"
