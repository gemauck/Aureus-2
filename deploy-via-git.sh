#!/bin/bash
# Git-based deployment - commits and pushes changes for server to pull
# Use this when SSH is not available but you can push to git

set -e

echo "🚀 Git-Based Deployment"
echo "======================"
echo ""
echo "This script will:"
echo "1. Build your project"
echo "2. Commit changes to git"
echo "3. Push to remote repository"
echo "4. Provide instructions for server-side pull"
echo ""

# Step 1: Build everything
echo "🏗️  Building project..."
npm run build
echo "✅ Build complete"
echo ""

# Step 2: Check git status
echo "📋 Checking git status..."
if [ ! -d ".git" ]; then
    echo "❌ ERROR: Not a git repository"
    echo "   Please initialize git or use deploy-direct.sh instead"
    exit 1
fi

# Check for uncommitted changes
if [ -z "$(git status --porcelain)" ]; then
    echo "✅ No uncommitted changes"
    echo "📤 Pushing to ensure remote is up to date..."
    git push origin main || git push origin master || echo "⚠️  Git push skipped"
else
    echo "📝 Uncommitted changes detected:"
    git status --short
    echo ""
    
    # Ask if user wants to commit (non-interactive mode will skip)
    if [ -n "$CI" ] || [ ! -t 0 ]; then
        echo "⚠️  Non-interactive mode: Auto-committing changes..."
        AUTO_COMMIT=true
    else
        read -p "Do you want to commit and push these changes? (y/n) " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            AUTO_COMMIT=true
        else
            echo "⚠️  Skipping commit. Changes will not be deployed."
            exit 0
        fi
    fi
    
    if [ "$AUTO_COMMIT" = true ]; then
        echo "💾 Committing changes..."
        git add .
        COMMIT_MSG="${DEPLOY_COMMIT_MSG:-Deploy: Update application $(date +%Y-%m-%d\ %H:%M:%S)}"
        git commit -m "$COMMIT_MSG" || echo "⚠️  Commit failed or nothing to commit"
        
        echo "📤 Pushing to remote..."
        git push origin main || git push origin master || {
            echo "❌ ERROR: Failed to push to git"
            echo "   Please check your git remote configuration:"
            git remote -v
            exit 1
        }
        echo "✅ Changes pushed to git"
    fi
fi

echo ""
echo "✅ Git deployment complete!"
echo ""
echo "📋 Next Steps:"
echo "=============="
echo ""
echo "Once SSH access is restored, run on the server:"
echo ""
echo "  ssh root@abcoafrica.co.za"
echo "  cd /var/www/abcotronics-erp"
echo "  git pull origin main"
echo "  npm install --production"
echo "  npx prisma generate"
echo "  pm2 restart abcotronics-erp"
echo ""
echo "Or use the deploy-to-server.sh script:"
echo "  ./deploy-to-server.sh"
echo ""
echo "🌐 Your changes are now in git and ready to deploy when SSH is available"

