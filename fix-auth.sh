#!/bin/bash
# Authentication Fix Script for Abcotronics ERP
# This script sets up the database and creates the admin user

echo "🔧 Fixing Authentication Issues for Abcotronics ERP..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Please run this script from the project root directory"
    exit 1
fi

echo "📋 Current directory: $(pwd)"

# Set up environment variables for local development
echo "🔧 Setting up environment variables..."
export DATABASE_URL="file:./dev.db"
export JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"

# Create a local .env file
cat > .env << EOF
DATABASE_URL="file:./dev.db"
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
EOF

echo "✅ Environment variables set"

# Copy the development schema
echo "📄 Setting up SQLite schema for local development..."
cp prisma/schema-dev.prisma prisma/schema.prisma

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate

# Run database migrations
echo "🗄️ Running database migrations..."
npx prisma migrate dev --name init

# Create admin user
echo "👤 Creating admin user..."
node -e "
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createAdmin() {
  try {
    console.log('🔍 Checking for existing admin user...');
    
    const existingUser = await prisma.user.findUnique({
      where: { email: 'admin@abcotronics.com' }
    });
    
    if (existingUser) {
      console.log('✅ Admin user already exists');
      console.log('📧 Email: admin@abcotronics.com');
      console.log('🔑 Password: admin123');
      return;
    }
    
    console.log('👤 Creating admin user...');
    
    const passwordHash = await bcrypt.hash('admin123', 10);
    
    const user = await prisma.user.create({
      data: {
        email: 'admin@abcotronics.com',
        name: 'Admin User',
        passwordHash,
        role: 'ADMIN'
      }
    });
    
    console.log('✅ Admin user created successfully!');
    console.log('📧 Email: admin@abcotronics.com');
    console.log('🔑 Password: admin123');
    
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
  } finally {
    await prisma.\$disconnect();
  }
}

createAdmin();
"

echo ""
echo "🎉 Authentication fix completed!"
echo ""
echo "📋 Next steps:"
echo "1. Start the development server: npm run dev"
echo "2. Open your browser to the application"
echo "3. Login with:"
echo "   📧 Email: admin@abcotronics.com"
echo "   🔑 Password: admin123"
echo ""
echo "🔧 For Railway production deployment:"
echo "1. Make sure DATABASE_URL is set in Railway environment variables"
echo "2. Run: railway variables set DATABASE_URL=your_postgres_url"
echo "3. Run: railway variables set JWT_SECRET=your_jwt_secret"
echo "4. Redeploy the application"
echo ""
