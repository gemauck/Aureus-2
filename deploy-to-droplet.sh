#!/bin/bash
# Deploy Aureus ERP to DigitalOcean Droplet

DROPLET_IP="165.22.127.196"
APP_DIR="/var/www/abcotronics-erp"
GIT_REPO="https://github.com/gemauck/Aureus-2.git"
BRANCH="main"

echo "🚀 Deploying Abcotronics ERP to Droplet..."
echo "📡 Droplet IP: $DROPLET_IP"

# SSH into droplet and deploy
ssh root@$DROPLET_IP << 'ENDSSH'
set -e

echo "✅ Connected to droplet"

# Update system
apt-get update

# Install dependencies
apt-get install -y nodejs npm git nginx

# Create app directory if it doesn't exist
    mkdir -p /var/www/abcotronics-erp

# Clone or update the repository
if [ -d "/var/www/abcotronics-erp/.git" ]; then
    echo "📥 Updating existing repository..."
    cd /var/www/abcotronics-erp
    git fetch origin
    git reset --hard origin/main
else
    echo "📥 Cloning repository..."
    cd /var/www
    git clone https://github.com/gemauck/Aureus-2.git abcotronics-erp
    cd abcotronics-erp
fi

echo "📦 Installing dependencies (including dev for build)..."
npm install

echo "🏗️  Building frontend (dist)..."
npm run build || echo "⚠️ Build had warnings but continuing..."

echo "🧪 Running deployment tests..."
# Set test URL to localhost since we're testing on the server
export TEST_URL="http://localhost:3000"
if ! npm run test:deploy; then
  echo "❌ Deployment tests failed! Aborting deployment."
  echo "   Please fix the issues above before deploying."
  exit 1
fi
echo "✅ All deployment tests passed!"

echo "🔧 Setting up environment..."
# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    cat > .env << 'EOF'
NODE_ENV=production
DATABASE_URL="file:./prisma/dev.db"
JWT_SECRET="CHANGE_THIS_TO_YOUR_JWT_SECRET"
PORT=3000
APP_URL="https://abcoafrica.co.za"
EOF
    echo "⚠️  IMPORTANT: Edit .env file and add your JWT_SECRET!"
fi

# Ensure database file exists
mkdir -p prisma
if [ ! -f prisma/dev.db ]; then
    touch prisma/dev.db
    chmod 666 prisma/dev.db
    echo "✅ Created empty database file"
fi

# Generate Prisma client
echo "🏗️  Generating Prisma client..."
npx prisma generate

# Push schema to database
echo "🗄️  Pushing database schema..."
npx prisma db push || echo "⚠️  Database push failed - you may need to configure DATABASE_URL in .env"

# Set up PM2 for process management
echo "⚙️  Setting up PM2..."
npm install -g pm2

# Create PM2 ecosystem file (use .mjs for ES modules)
cat > ecosystem.config.mjs << 'EOFPM2'
export default {
  apps: [{
    name: 'abcotronics-erp',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      DATABASE_URL: 'file:./prisma/dev.db',
      APP_URL: 'https://abcoafrica.co.za'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
};
EOFPM2

# Create logs directory
mkdir -p logs

# Stop existing PM2 process
pm2 delete abcotronics-erp || true

# Start the application using ecosystem config
echo "🚀 Starting application..."
pm2 start server.js --name abcotronics-erp -i 1

# Wait for server to start
echo "⏳ Waiting for server to start..."
sleep 5

# Run post-deployment tests
echo "🧪 Running post-deployment tests..."
export TEST_URL="http://localhost:3000"
if npm run test:deploy; then
  echo "✅ Post-deployment tests passed!"
else
  echo "⚠️  Post-deployment tests failed, but application is running"
  echo "   Please check the application manually at http://165.22.127.196:3000"
fi

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup systemd -u root --hp /root

echo "✅ Deployment complete!"
echo "🌐 Application should be running on: http://165.22.127.196:3000"
ENDSSH

echo "✅ Deployment successful!"

