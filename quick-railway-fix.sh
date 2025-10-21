#!/bin/bash

# Quick Railway Deployment Fix
echo "🚀 Quick Railway deployment fix..."

# Ensure we're using the working SQLite schema
echo "🔄 Ensuring SQLite schema is active..."
cp prisma/schema.sqlite.prisma prisma/schema.prisma

# Generate Prisma client
echo "🔨 Generating Prisma client..."
npx prisma generate

# Build CSS
echo "🎨 Building CSS..."
npm run build:css

# Create Railway environment file
echo "🔑 Creating Railway environment..."
cat > .env << EOF
DATABASE_URL="file:./dev.db"
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production-$(date +%s)"
NODE_ENV="production"
PORT=3000
APP_URL="https://abco-erp-2-production.up.railway.app"
EOF

echo "✅ Environment configured for Railway"

# Commit changes
echo "📝 Committing changes..."
git add .
git commit -m "Fix: Deploy working SQLite version to Railway" || echo "No changes to commit"

# Deploy to Railway
echo "🚀 Deploying to Railway..."
echo "Please run: railway up"
echo ""
echo "After deployment, run:"
echo "railway run npx prisma db push"
echo "railway run node -e \"const { PrismaClient } = require('@prisma/client'); const bcrypt = require('bcryptjs'); async function createAdmin() { const prisma = new PrismaClient(); try { const hashedPassword = await bcrypt.hash('admin123', 10); const admin = await prisma.user.upsert({ where: { email: 'admin@abcotronics.com' }, update: { passwordHash: hashedPassword }, create: { email: 'admin@abcotronics.com', name: 'Admin User', passwordHash: hashedPassword, role: 'admin', provider: 'local' } }); console.log('✅ Admin user created:', admin.email); } catch (error) { console.error('❌ Error:', error.message); } finally { await prisma.\$disconnect(); } } createAdmin();\""

echo ""
echo "🎉 Ready for Railway deployment!"
echo "📝 Login credentials will be:"
echo "   Email: admin@abcotronics.com"
echo "   Password: admin123"
