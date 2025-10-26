#!/bin/bash

echo "🧹 Starting comprehensive project cleanup..."

# Stop any running servers
echo "🛑 Stopping any running servers..."
pkill -f "node server.js" 2>/dev/null || true

# Remove all HTML test files
echo "🗑️  Removing HTML test files..."
rm -f *.html

# Remove all deployment scripts and triggers
echo "🗑️  Removing deployment scripts and triggers..."
rm -f deploy-*.sh
rm -f deploy-*.txt
rm -f deploy-trigger*.txt
rm -f force-*.txt
rm -f force-*.sh
rm -f redeploy.txt
rm -f quick-*.sh
rm -f fix-*.sh
rm -f test-*.sh
rm -f setup-*.sh
rm -f migrate-*.js
rm -f create-*.js
rm -f clear-*.html
rm -f purge-*.html
rm -f delete-*.html
rm -f delete-*.js
rm -f delete-*.sh

# Remove all documentation files
echo "🗑️  Removing documentation files..."
rm -f *.md

# Remove all JavaScript test files
echo "🗑️  Removing JavaScript test files..."
rm -f *.js
rm -f test-*.js
rm -f comprehensive-*.js
rm -f direct-*.js
rm -f quick-*.js
rm -f simple-*.js
rm -f pre-*.js

# Remove all CSS files except main ones
echo "🗑️  Removing unnecessary CSS files..."
rm -f dark-mode-*.css
rm -f mobile-*.css

# Remove all patch files
echo "🗑️  Removing patch files..."
rm -f *.patch

# Remove all text files
echo "🗑️  Removing text files..."
rm -f *.txt
rm -f auth_header.txt
rm -f cookies.txt
rm -f token.txt

# Remove all Icon files
echo "🗑️  Removing Icon files..."
find . -name "Icon" -type f -delete

# Remove duplicate schema files (keep only schema.prisma)
echo "🗑️  Removing duplicate schema files..."
cd prisma
rm -f schema-dev.prisma
rm -f schema-fixed.prisma
rm -f schema-postgres.prisma
rm -f schema-sqlite.prisma
rm -f schema.sqlite.prisma
cd ..

# Remove duplicate database files
echo "🗑️  Removing duplicate database files..."
rm -f prisma/prisma/dev.db

# Remove backup files
echo "🗑️  Removing backup files..."
find . -name "*.backup*" -type f -delete

# Remove deprecated directories
echo "🗑️  Removing deprecated directories..."
rm -rf src/components/projects/_deprecated

# Remove unnecessary directories
echo "🗑️  Removing unnecessary directories..."
rm -rf github-upload
rm -rf docs
rm -rf tests
rm -rf server
rm -rf auth
rm -rf migrations
rm -rf scripts

# Remove unnecessary files in root
echo "🗑️  Removing unnecessary root files..."
rm -f accept-invitation.html
rm -f index.js
rm -f server-clean.js
rm -f server-debug.js
rm -f server-production.js
rm -f server-simple.js
rm -f server.py
rm -f start-production.js
rm -f start-server.sh
rm -f mock-auth-server.js
rm -f database-seed-clients.js
rm -f nixpacks.toml
rm -f Procfile
rm -f railway.json
rm -f railway.toml
rm -f postcss.config.js

# Clean up node_modules if it exists (will be reinstalled)
echo "🗑️  Removing node_modules..."
rm -rf node_modules

# Remove dist directory
echo "🗑️  Removing dist directory..."
rm -rf dist

echo "✅ Comprehensive cleanup completed!"
echo "📦 Run 'npm install' to reinstall dependencies"
echo "🚀 Run 'npm run dev' to start the server"
