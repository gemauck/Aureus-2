#!/bin/bash
# Deploy Progress Tracker Error Handling Fixes

echo "🚀 Deploying Progress Tracker error handling fixes..."
echo ""

# Navigate to project directory
cd "$(dirname "$0")"

echo "📝 Changes being deployed:"
echo "  1. Enhanced error handling in Projects.jsx for Progress Tracker"
echo "  2. Improved error handling in ProjectProgressTracker.jsx"
echo "  3. Added error display UI with retry functionality"
echo "  4. Wrapped component in ErrorBoundary for better error catching"
echo "  5. Fixed component validation and loading checks"
echo ""

# Check if git is dirty
if [[ $(git status --porcelain) ]]; then
    echo "📦 Committing changes..."
    git add src/components/projects/Projects.jsx
    git add src/components/projects/ProjectProgressTracker.jsx
    git commit -m "Fix: Enhanced error handling for Progress Tracker

- Add comprehensive error handling in Projects.jsx
- Validate ProjectProgressTracker is a function before rendering
- Wrap Progress Tracker in ErrorBoundary for additional safety
- Add loadError state and error display UI in ProjectProgressTracker
- Improve loadProjects error handling with nested try-catch
- Add retry functionality for failed project loads
- Fix indentation issues that could cause syntax errors
- Show clear error messages instead of generic 'Something went wrong'"
    
    echo "✅ Changes committed"
else
    echo "ℹ️  No changes to commit"
fi

# Push to GitHub
echo ""
echo "⬆️  Pushing to GitHub..."
git push origin main

if [ $? -eq 0 ]; then
    echo "✅ Successfully pushed to GitHub"
else
    echo "❌ Failed to push to GitHub"
    exit 1
fi

echo ""
echo "🔄 Railway will auto-deploy from GitHub..."
echo ""
echo "📋 Post-deployment testing:"
echo "  1. Wait for Railway deployment to complete (~2 minutes)"
echo "  2. Navigate to https://abcoafrica.co.za/projects"
echo "  3. Click 'Progress Tracker' button"
echo "  4. Verify the tracker loads correctly or shows helpful error message"
echo "  5. Check browser console for detailed error logs if issues occur"
echo ""
echo "✅ Deployment initiated successfully!"

