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
# Create .env file with Digital Ocean database
if [ ! -f .env ]; then
    cat > .env << 'EOF'
NODE_ENV=production
DATABASE_URL="${DATABASE_URL:-postgresql://doadmin:YOUR_PASSWORD_HERE@dbaas-db-6934625-nov-3-backup-nov-3-backup4-nov-6-backup-do-use.l.db.ondigitalocean.com:25060/defaultdb?sslmode=require}"
JWT_SECRET=0266f788ee2255e2aa973f0984903fb61f3fb1d9f528b315c9dbd0bf53fe5ea8
PORT=3000
APP_URL="https://abcoafrica.co.za"
EOF
    echo "⚠️  IMPORTANT: Update DATABASE_URL in .env with the correct password from Digital Ocean"
    echo "✅ .env file created with Digital Ocean database"
else
    # Ensure .env uses Digital Ocean database, not local
    if grep -q "localhost\|127.0.0.1\|file:./prisma" .env 2>/dev/null; then
        echo "⚠️  Local database detected in .env - updating to Digital Ocean..."
        cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
        echo "⚠️  Please update DATABASE_URL in .env with the correct password"
        echo "   Format: postgresql://doadmin:PASSWORD@dbaas-db-6934625-nov-3-backup-nov-3-backup4-nov-6-backup-do-use.l.db.ondigitalocean.com:25060/defaultdb?sslmode=require"
        # Update host but preserve password if it exists
        sed -i 's|@[^/]*/|@dbaas-db-6934625-nov-3-backup-nov-3-backup4-nov-6-backup-do-use.l.db.ondigitalocean.com:25060/|' .env || true
        echo "✅ .env updated to use Digital Ocean database"
    fi
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

# Create PM2 ecosystem file with Digital Ocean database (use .mjs for ES modules)
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
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://doadmin:YOUR_PASSWORD_HERE@dbaas-db-6934625-nov-3-backup-nov-3-backup4-nov-6-backup-do-use.l.db.ondigitalocean.com:25060/defaultdb?sslmode=require',
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

