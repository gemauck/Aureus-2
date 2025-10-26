#!/bin/bash
# Deploy Aureus ERP to DigitalOcean Droplet

DROPLET_IP="64.227.32.244"
APP_DIR="/var/www/aureus-erp"
GIT_REPO="git@github.com:gemauck/Aureus-2.git"
BRANCH="main"

echo "🚀 Deploying Aureus ERP to Droplet..."
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
mkdir -p /var/www/aureus-erp

# Clone or update the repository
if [ -d "/var/www/aureus-erp/.git" ]; then
    echo "📥 Updating existing repository..."
    cd /var/www/aureus-erp
    git fetch origin
    git reset --hard origin/main
else
    echo "📥 Cloning repository..."
    cd /var/www
    git clone git@github.com:gemauck/Aureus-2.git aureus-erp
    cd aureus-erp
fi

echo "📦 Installing dependencies..."
npm install

echo "🔧 Setting up environment..."
# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    cat > .env << 'EOF'
NODE_ENV=production
DATABASE_URL=file:./prisma/dev.db
PORT=3000
EOF
fi

# Generate Prisma client
echo "🏗️  Generating Prisma client..."
npx prisma generate

# Run database migrations
echo "🗄️  Running database migrations..."
npx prisma migrate deploy

# Set up PM2 for process management
echo "⚙️  Setting up PM2..."
npm install -g pm2

# Create PM2 ecosystem file
cat > ecosystem.config.js << 'EOFPM2'
module.exports = {
  apps: [{
    name: 'aureus-erp',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
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
pm2 delete aureus-erp || true

# Start the application
echo "🚀 Starting application..."
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup systemd -u root --hp /root

echo "✅ Deployment complete!"
echo "🌐 Application should be running on: http://64.227.32.244:3000"
ENDSSH

echo "✅ Deployment successful!"

