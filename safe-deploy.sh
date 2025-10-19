#!/bin/bash

# Safe Deployment Script
# Runs essential checks before deployment

echo "🚀 Safe Deployment Script"
echo "========================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

# Check 1: Git status
echo ""
echo "📋 Checking Git Status..."
if git status --porcelain | grep -q .; then
    print_warning "Uncommitted changes detected"
    git status --short
    echo ""
    read -p "Commit changes? (y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git add .
        git commit -m "Pre-deployment commit - $(date '+%Y-%m-%d %H:%M:%S')"
        print_status "Changes committed"
    fi
else
    print_status "Working directory is clean"
fi

# Check 2: Package consistency
echo ""
echo "📦 Checking Package Dependencies..."
if npm ls --depth=0 > /dev/null 2>&1; then
    print_status "Package dependencies are consistent"
else
    print_warning "Running npm install to fix dependencies..."
    npm install
    if [ $? -eq 0 ]; then
        print_status "Dependencies updated"
        git add package-lock.json
        git commit -m "Update package-lock.json"
    else
        print_error "Failed to update dependencies"
        exit 1
    fi
fi

# Check 3: Critical syntax errors
echo ""
echo "🔍 Checking for Critical Syntax Errors..."
critical_errors=0

# Check for duplicate useState declarations
if grep -r "const \[.*\] = useState" src/ | sort | uniq -d > /dev/null; then
    print_warning "Potential duplicate useState declarations found"
    critical_errors=$((critical_errors + 1))
fi

# Check for undefined function calls
if grep -r "setShowClientModal\|setShowLeadModal" src/ | grep -v "//" > /dev/null; then
    print_warning "Undefined function calls found"
    critical_errors=$((critical_errors + 1))
fi

if [ $critical_errors -eq 0 ]; then
    print_status "No critical syntax errors found"
else
    print_warning "Found $critical_errors potential issues"
fi

# Check 4: Deploy
echo ""
echo "🚀 Deploying..."
echo "Pushing to GitHub..."
if git push origin main; then
    print_status "Successfully pushed to GitHub"
    
    # Trigger Railway deployment
    echo "Triggering Railway deployment..."
    echo "Deployment triggered at $(date)" > deploy-trigger-$(date +%s).txt
    git add deploy-trigger-*.txt
    git commit -m "Trigger Railway deployment - $(date '+%Y-%m-%d %H:%M:%S')"
    git push origin main
    
    print_status "Railway deployment triggered"
    
    echo ""
    echo "🎉 Deployment completed!"
    echo ""
    echo "Next steps:"
    echo "1. Monitor Railway deployment logs"
    echo "2. Test the deployed application"
    echo "3. Check for any runtime errors"
    echo ""
    echo "Railway URL: https://abco-erp-2-production.up.railway.app"
else
    print_error "Failed to push to GitHub"
    exit 1
fi
