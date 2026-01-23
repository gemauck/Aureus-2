#!/bin/bash
# Setup using Docker - no sudo needed for database

echo "🐳 Setting up local development with Docker PostgreSQL"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed"
    echo ""
    echo "Please install Docker Desktop for Mac:"
    echo "  https://www.docker.com/products/docker-desktop"
    exit 1
fi

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo "❌ Docker is not running"
    echo ""
    echo "Please start Docker Desktop and try again"
    exit 1
fi

echo "✅ Docker is running"
echo ""

# Stop any existing container
echo "🛑 Stopping any existing containers..."
docker-compose down 2>/dev/null || true

# Start PostgreSQL
echo "🚀 Starting PostgreSQL container..."
docker-compose up -d

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 5

for i in {1..30}; do
    if docker exec abcotronics_erp_local_db pg_isready -U gemau > /dev/null 2>&1; then
        echo "✅ PostgreSQL is ready!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ PostgreSQL failed to start"
        exit 1
    fi
    sleep 1
done

# Create .env.local
echo ""
echo "📝 Creating .env.local..."
cat > .env.local << 'EOF'
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:3000
DATABASE_URL="postgresql://gemau@localhost:5432/abcotronics_erp_local"
JWT_SECRET=0266f788ee2255e2aa973f0984903fb61f3fb1d9f528b315c9dbd0bf53fe5ea8
DEV_LOCAL_NO_DB=false
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=gemauck@gmail.com
SMTP_PASS=psrbqbzifyooosfx
EMAIL_FROM=gemauck@gmail.com
SMTP_FROM_EMAIL=noreply@abcotronics.com
SMTP_FROM_NAME=Abcotronics Security
EOF

echo "✅ .env.local created"

# Set up schema
echo ""
echo "🔄 Setting up database schema..."
export DATABASE_URL="postgresql://gemau@localhost:5432/abcotronics_erp_local"
npx prisma db push --accept-data-loss 2>&1 | tail -10

echo ""
echo "✅✅✅ Setup Complete! ✅✅✅"
echo ""
echo "PostgreSQL is running in Docker (no password needed)"
echo ""
echo "To start your dev server:"
echo "  npm run dev"
echo ""
echo "To stop PostgreSQL:"
echo "  docker-compose down"
echo ""
echo "To start PostgreSQL again:"
echo "  docker-compose up -d"
echo ""





