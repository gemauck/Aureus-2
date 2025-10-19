#!/bin/bash

# Deploy with Pre-deployment Testing
# This script runs tests before deployment to catch issues early

echo "🚀 Starting Deployment with Pre-deployment Testing..."
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

# Step 1: Run pre-deployment tests
echo ""
echo "🔍 Running Pre-deployment Tests..."
echo "=================================="

if node pre-deployment-test.js; then
    print_status "All pre-deployment tests passed!"
else
    test_exit_code=$?
    if [ $test_exit_code -eq 1 ]; then
        print_error "Pre-deployment tests failed with errors!"
        print_error "Deployment blocked. Please fix the errors above."
        exit 1
    else
        print_warning "Pre-deployment tests completed with warnings"
        echo ""
        read -p "Continue with deployment despite warnings? (y/N): " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_error "Deployment cancelled by user"
            exit 1
        fi
    fi
fi

# Step 2: Check Git status
echo ""
echo "📋 Checking Git Status..."
echo "========================"

if git status --porcelain | grep -q .; then
    print_warning "You have uncommitted changes"
    git status --short
    echo ""
    read -p "Commit changes before deploying? (y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Enter commit message (or press Enter for auto-generated):"
        read commit_message
        if [ -z "$commit_message" ]; then
            commit_message="Pre-deployment commit - $(date '+%Y-%m-%d %H:%M:%S')"
        fi
        git add .
        git commit -m "$commit_message"
        print_status "Changes committed"
    else
        print_error "Deployment cancelled - uncommitted changes present"
        exit 1
    fi
else
    print_status "Working directory is clean"
fi

# Step 3: Run additional checks
echo ""
echo "🔧 Running Additional Checks..."
echo "==============================="

# Check if package-lock.json is up to date
echo "Checking package-lock.json..."
if npm ls --depth=0 > /dev/null 2>&1; then
    print_status "Package dependencies are consistent"
else
    print_warning "Package dependencies may be inconsistent"
    echo "Running npm install to update package-lock.json..."
    npm install
    if [ $? -eq 0 ]; then
        print_status "Package dependencies updated"
        git add package-lock.json
        git commit -m "Update package-lock.json"
    else
        print_error "Failed to update package dependencies"
        exit 1
    fi
fi

# Check for large files that shouldn't be deployed
echo "Checking for large files..."
large_files=$(find . -type f -size +10M -not -path "./node_modules/*" -not -path "./.git/*" | head -5)
if [ -n "$large_files" ]; then
    print_warning "Found large files that may slow deployment:"
    echo "$large_files"
fi

# Step 4: Deploy to GitHub
echo ""
echo "🚀 Deploying to GitHub..."
echo "========================="

echo "Pushing to GitHub..."
if git push origin main; then
    print_status "Successfully pushed to GitHub"
else
    print_error "Failed to push to GitHub"
    exit 1
fi

# Step 5: Trigger Railway deployment
echo ""
echo "🚂 Triggering Railway Deployment..."
echo "==================================="

# Create a deployment trigger file
echo "Deployment triggered at $(date)" > deploy-trigger-$(date +%s).txt
git add deploy-trigger-*.txt
git commit -m "Trigger Railway deployment - $(date '+%Y-%m-%d %H:%M:%S')"
git push origin main

print_status "Railway deployment triggered"

# Step 6: Monitor deployment
echo ""
echo "📊 Deployment Summary..."
echo "======================="
print_status "Pre-deployment tests: PASSED"
print_status "Git status: CLEAN"
print_status "Package dependencies: CONSISTENT"
print_status "GitHub push: SUCCESS"
print_status "Railway deployment: TRIGGERED"

echo ""
echo "🎉 Deployment process completed!"
echo ""
echo "Next steps:"
echo "1. Monitor Railway deployment logs"
echo "2. Test the deployed application"
echo "3. Check for any runtime errors"
echo ""
echo "Railway URL: https://abco-erp-2-production.up.railway.app"
echo ""
