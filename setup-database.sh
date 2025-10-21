#!/bin/bash

# Database Setup Script for Abcotronics ERP
echo "🔧 Setting up database for Abcotronics ERP..."

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL is not installed. Please install PostgreSQL first."
    echo "   On macOS: brew install postgresql"
    echo "   On Ubuntu: sudo apt-get install postgresql postgresql-contrib"
    exit 1
fi

# Check if PostgreSQL is running
if ! pg_isready -q; then
    echo "⚠️  PostgreSQL is not running. Starting PostgreSQL..."
    if command -v brew &> /dev/null; then
        brew services start postgresql
    elif command -v systemctl &> /dev/null; then
        sudo systemctl start postgresql
    fi
    sleep 2
fi

# Create database if it doesn't exist
echo "📊 Creating database 'abcotronics_erp'..."
createdb abcotronics_erp 2>/dev/null || echo "Database already exists"

# Set up environment variables
echo "🔑 Setting up environment variables..."
cat > .env << EOF
DATABASE_URL="postgresql://postgres:@localhost:5432/abcotronics_erp"
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production-$(date +%s)"
NODE_ENV="development"
PORT=3000
APP_URL="http://localhost:3000"
EOF

echo "✅ Environment variables configured"

# Push database schema
echo "📋 Pushing database schema..."
npx prisma db push

# Generate Prisma client
echo "🔨 Generating Prisma client..."
npx prisma generate

# Create admin user
echo "👤 Creating admin user..."
node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

async function createAdmin() {
  const prisma = new PrismaClient();
  try {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const admin = await prisma.user.upsert({
      where: { email: 'admin@abcotronics.com' },
      update: { passwordHash: hashedPassword },
      create: {
        email: 'admin@abcotronics.com',
        name: 'Admin User',
        passwordHash: hashedPassword,
        role: 'admin',
        provider: 'local'
      }
    });
    console.log('✅ Admin user created/updated:', admin.email);
  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
  } finally {
    await prisma.\$disconnect();
  }
}

createAdmin();
"

echo ""
echo "🎉 Database setup complete!"
echo ""
echo "📝 Login credentials:"
echo "   Email: admin@abcotronics.com"
echo "   Password: admin123"
echo ""
echo "🚀 Start the server with: npm run dev"
echo "🌐 Access the application at: http://localhost:3000"
