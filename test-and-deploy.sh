#!/bin/bash

# ERP System Test and Deploy Script
echo "🚀 Starting ERP System Test and Deploy Process..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Please run this script from the project root."
    exit 1
fi

print_status "✅ Project directory confirmed"

# Check if all critical files exist
critical_files=(
    "src/utils/localStorage.js"
    "src/utils/dataService.js"
    "src/components/teams/Teams.jsx"
    "src/components/projects/Projects.jsx"
    "src/components/projects/ProjectDetail.jsx"
    "src/components/projects/ProjectModal.jsx"
    "src/components/projects/ProjectProgressTracker.jsx"
    "src/components/projects/MonthlyDocumentCollectionTracker.jsx"
)

print_status "🔍 Checking critical files..."
for file in "${critical_files[@]}"; do
    if [ -f "$file" ]; then
        print_success "✅ $file exists"
    else
        print_error "❌ $file missing"
        exit 1
    fi
done

# Check for any obvious syntax errors in key files
print_status "🔍 Checking for syntax errors..."

# Check JavaScript files for basic syntax
js_files=(
    "src/utils/localStorage.js"
    "src/utils/dataService.js"
)

for file in "${js_files[@]}"; do
    if node -c "$file" 2>/dev/null; then
        print_success "✅ $file syntax OK"
    else
        print_error "❌ $file has syntax errors"
        exit 1
    fi
done

# Check if Railway CLI is available
if command -v railway &> /dev/null; then
    print_success "✅ Railway CLI is available"
    
    # Check if we're logged in to Railway
    if railway whoami &> /dev/null; then
        print_success "✅ Logged in to Railway"
        
        # Deploy to Railway
        print_status "🚀 Deploying to Railway..."
        if railway up --detach; then
            print_success "🎉 Deployment successful!"
            
            # Get the deployment URL
            print_status "🔗 Getting deployment URL..."
            railway domain
        else
            print_error "❌ Deployment failed"
            exit 1
        fi
    else
        print_warning "⚠️ Not logged in to Railway. Please run 'railway login' first."
        print_status "📋 Manual deployment steps:"
        echo "1. Run: railway login"
        echo "2. Run: railway up"
        echo "3. Check deployment status with: railway status"
    fi
else
    print_warning "⚠️ Railway CLI not found. Please install it first."
    print_status "📋 Manual deployment steps:"
    echo "1. Install Railway CLI: npm install -g @railway/cli"
    echo "2. Run: railway login"
    echo "3. Run: railway up"
fi

# Summary
print_status "📊 Test and Deploy Summary:"
echo "✅ All critical files present"
echo "✅ Syntax checks passed"
echo "✅ Ready for deployment"

print_success "🎉 ERP System fixes are ready!"
print_status "🔗 Test the fixes at: http://localhost:8080/test-fixes.html"
print_status "🌐 Production URL will be available after Railway deployment"
