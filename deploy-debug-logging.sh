#!/bin/bash
# Quick deploy script for debug logging changes

set -e

echo "🚀 Deploying debug logging changes..."
echo ""

# Commit changes
echo "📝 Committing changes..."
git add src/components/projects/ProjectDetail.jsx
git commit -m "Debug: Add logging for Monthly FMS Review dropdown visibility" || echo "No changes to commit"

# Push to GitHub
echo "📤 Pushing to GitHub..."
git push origin main

# Deploy to server
echo "🚀 Deploying to server..."
./deploy-to-server.sh

echo ""
echo "✅ Deployment complete!"


