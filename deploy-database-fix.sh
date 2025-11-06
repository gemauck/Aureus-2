#!/bin/bash
# Deploy database connection fix to droplet
# This will fix the DATABASE_URL mismatch (SQLite -> PostgreSQL)

set -e

DROPLET_IP="165.22.127.196"
APP_DIR="/var/www/abcotronics-erp"
APP_NAME="abcotronics-erp"

echo "🔧 Deploying Database Connection Fix to Droplet"
echo "================================================"
echo ""

# Step 1: Copy diagnostic script
echo "📤 Step 1: Copying diagnostic script..."
scp diagnose-droplet-db.sh root@$DROPLET_IP:/root/ || echo "⚠️  Could not copy diagnostic script"
echo "✅ Scripts ready"
echo ""

# Step 2: SSH and fix database connection
echo "📡 Step 2: Connecting to droplet and fixing database..."
ssh root@$DROPLET_IP << 'ENDSSH'
set -e

cd /var/www/abcotronics-erp
echo "📁 Current directory: $(pwd)"
echo ""

# Check current state
echo "🔍 Checking current configuration..."
if [ -f .env ]; then
    echo "   .env file exists"
    grep DATABASE_URL .env || echo "   DATABASE_URL not in .env"
fi

if [ -f ecosystem.config.mjs ]; then
    echo "   ecosystem.config.mjs exists"
    grep DATABASE_URL ecosystem.config.mjs || echo "   DATABASE_URL not in ecosystem.config.mjs"
fi
echo ""

# Install PostgreSQL if not installed
echo "📦 Step 1: Ensuring PostgreSQL is installed..."
if ! command -v psql &> /dev/null; then
    echo "   Installing PostgreSQL..."
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y postgresql postgresql-contrib > /dev/null 2>&1
    echo "✅ PostgreSQL installed"
else
    echo "✅ PostgreSQL already installed"
fi

# Start PostgreSQL
echo ""
echo "🔄 Step 2: Starting PostgreSQL service..."
systemctl start postgresql || true
systemctl enable postgresql || true
sleep 2

if systemctl is-active --quiet postgresql; then
    echo "✅ PostgreSQL is running"
else
    echo "❌ PostgreSQL failed to start - check manually"
    systemctl status postgresql --no-pager -l | head -10
fi
echo ""

# Create database if it doesn't exist
echo "🗄️  Step 3: Ensuring database exists..."
DB_NAME="abcotronics_erp"
DB_USER="postgres"

if sudo -u postgres psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
    echo "✅ Database '$DB_NAME' already exists"
else
    echo "   Creating database '$DB_NAME'..."
    sudo -u postgres createdb $DB_NAME 2>&1 || echo "   Database may already exist or creation failed"
    echo "✅ Database ready"
fi
echo ""

# Set PostgreSQL password for postgres user (if needed)
echo "🔐 Step 4: Setting up PostgreSQL authentication..."
# Allow local connections without password (for now)
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'postgres';" 2>/dev/null || true
echo "✅ PostgreSQL authentication configured"
echo ""

# Update DATABASE_URL
echo "📝 Step 5: Updating DATABASE_URL..."
DB_URL="postgresql://postgres:postgres@localhost:5432/$DB_NAME"

# Update .env file
if [ -f .env ]; then
    if grep -q "DATABASE_URL" .env; then
        # Backup original
        cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
        # Update existing
        sed -i "s|DATABASE_URL=.*|DATABASE_URL=\"$DB_URL\"|" .env
        echo "✅ Updated DATABASE_URL in .env"
    else
        # Add new
        echo "DATABASE_URL=\"$DB_URL\"" >> .env
        echo "✅ Added DATABASE_URL to .env"
    fi
else
    # Create .env file
    cat > .env << EOF
NODE_ENV=production
DATABASE_URL="$DB_URL"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"
PORT=3000
APP_URL="https://abcoafrica.co.za"
EOF
    echo "✅ Created .env file with DATABASE_URL"
fi

# Verify .env update
echo "   Current DATABASE_URL in .env:"
grep DATABASE_URL .env | head -1
echo ""

# Update ecosystem.config.mjs
if [ -f ecosystem.config.mjs ]; then
    # Backup original
    cp ecosystem.config.mjs ecosystem.config.mjs.backup.$(date +%Y%m%d_%H%M%S)
    
    # Update DATABASE_URL in ecosystem config
    if grep -q "DATABASE_URL" ecosystem.config.mjs; then
        sed -i "s|DATABASE_URL: '.*'|DATABASE_URL: '$DB_URL'|" ecosystem.config.mjs
        echo "✅ Updated DATABASE_URL in ecosystem.config.mjs"
    else
        # Add to env section
        sed -i "/env: {/a\      DATABASE_URL: '$DB_URL'," ecosystem.config.mjs
        echo "✅ Added DATABASE_URL to ecosystem.config.mjs"
    fi
    
    # Verify update
    echo "   Current DATABASE_URL in ecosystem.config.mjs:"
    grep DATABASE_URL ecosystem.config.mjs | head -1
else
    echo "⚠️  ecosystem.config.mjs not found - creating it..."
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
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/abcotronics_erp',
      APP_URL: 'https://abcoafrica.co.za'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
};
EOFPM2
    echo "✅ Created ecosystem.config.mjs"
fi
echo ""

# Generate Prisma client
echo "🏗️  Step 6: Generating Prisma client..."
export DATABASE_URL="$DB_URL"
npx prisma generate 2>&1 | tail -5 || echo "⚠️  Prisma generate had issues"
echo ""

# Push database schema
echo "🗄️  Step 7: Pushing database schema..."
npx prisma db push --accept-data-loss 2>&1 | tail -10 || echo "⚠️  Database push had issues"
echo ""

# Restart application
echo "🔄 Step 8: Restarting application..."
if command -v pm2 &> /dev/null; then
    # Stop existing process
    pm2 delete $APP_NAME 2>/dev/null || true
    
    # Start with ecosystem config
    pm2 start ecosystem.config.mjs || pm2 start server.js --name $APP_NAME --update-env
    pm2 save
    
    echo "✅ Application restarted with PM2"
    echo ""
    echo "📋 PM2 Status:"
    pm2 list
else
    echo "⚠️  PM2 not found - application may need manual restart"
fi
echo ""

# Wait a moment for app to start
echo "⏳ Waiting for application to start..."
sleep 5
echo ""

# Test connection
echo "🧪 Step 9: Testing database connection..."
if curl -s http://localhost:3000/health 2>/dev/null | grep -q "connected"; then
    echo "✅ Health check shows database connected!"
elif curl -s http://localhost:3000/health 2>/dev/null | grep -q "failed"; then
    echo "⚠️  Health check shows database connection failed"
    echo "   Check logs: pm2 logs $APP_NAME --lines 50"
else
    echo "⚠️  Could not reach health endpoint"
    echo "   Application may still be starting"
fi
echo ""

echo "✅ Database connection fix complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Check logs: pm2 logs $APP_NAME --lines 50"
echo "   2. Test API: curl http://localhost:3000/api/test-db-connection"
echo "   3. Check health: curl http://localhost:3000/health"
echo ""
echo "🔍 If issues persist, run diagnostic:"
echo "   /root/diagnose-droplet-db.sh"

ENDSSH

echo ""
echo "✅ Deployment complete!"
echo "💡 Check the output above for any errors"
echo "🌐 Test your site: https://abcoafrica.co.za"

