#!/bin/bash
# Fix DATABASE_URL on production server for abcoafrica.co.za

# This script must be run ON the production server
# SSH into the server first: ssh root@165.22.127.196

DROPLET_IP="165.22.127.196"
SERVER_USER="root"
APP_DIR="/var/www/abcotronics-erp"

echo "🔧 Fixing DATABASE_URL on production server..."
echo "📡 Server: $DROPLET_IP"
echo "📁 App Directory: $APP_DIR"

# Check if running locally or need to SSH
if [ "$(hostname)" != "$DROPLET_IP" ]; then
    echo "⚠️  Running from local machine. Use SSH to execute on server:"
    echo "   ssh $SERVER_USER@$DROPLET_IP 'bash -s' < fix-production-database-url.sh"
    exit 1
fi

# Navigate to app directory
cd $APP_DIR || { echo "❌ Failed to change directory to $APP_DIR"; exit 1; }
echo "✅ Changed to app directory"

# Check for .env file
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Creating one..."
    cat > .env << 'EOF'
NODE_ENV=production
PORT=3000
DATABASE_URL="file:./prisma/dev.db"
JWT_SECRET="CHANGE_THIS_TO_YOUR_JWT_SECRET"
APP_URL="https://abcoafrica.co.za"
EOF
    echo "✅ Created .env file"
else
    echo "✅ .env file exists"
    
    # Check if DATABASE_URL is set in .env
    if ! grep -q "^DATABASE_URL=" .env; then
        echo "⚠️  DATABASE_URL not found in .env. Adding it..."
        echo '' >> .env
        echo 'DATABASE_URL="file:./prisma/dev.db"' >> .env
        echo "✅ Added DATABASE_URL to .env"
    else
        echo "✅ DATABASE_URL already exists in .env"
        # Show current value (safely)
        echo "📋 Current DATABASE_URL:"
        grep "^DATABASE_URL=" .env | sed 's/DATABASE_URL=/\t/'
    fi
fi

# Update PM2 ecosystem config if it exists
if [ -f ecosystem.config.mjs ]; then
    echo "✅ Found ecosystem.config.mjs"
    
    # Check if DATABASE_URL is in the config
    if ! grep -q "DATABASE_URL" ecosystem.config.mjs; then
        echo "⚠️  DATABASE_URL not in ecosystem.config.mjs"
        echo "📝 You may need to update ecosystem.config.mjs manually or use .env file"
    else
        echo "✅ DATABASE_URL found in ecosystem.config.mjs"
    fi
else
    echo "⚠️  No ecosystem.config.mjs found. Creating one..."
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
    echo "✅ Created ecosystem.config.mjs"
fi

# Ensure database file exists
if [ ! -d prisma ]; then
    echo "❌ No prisma directory found!"
    exit 1
fi

if [ ! -f prisma/dev.db ]; then
    echo "⚠️  Database file does not exist. Creating empty database..."
    touch prisma/dev.db
    chmod 666 prisma/dev.db
    echo "✅ Created prisma/dev.db"
else
    echo "✅ Database file exists"
    ls -lh prisma/dev.db
fi

# Check permissions
echo "📋 Checking database permissions:"
ls -ld prisma/
ls -l prisma/dev.db

# Restart PM2 to pick up changes
echo ""
echo "🔄 Restarting PM2 process..."
pm2 restart abcotronics-erp --update-env || pm2 restart all --update-env

echo ""
echo "✅ DATABASE_URL fix applied!"
echo ""
echo "📋 Next steps:"
echo "1. Check PM2 logs: pm2 logs abcotronics-erp --lines 50"
echo "2. Check for Prisma initialization: grep 'Prisma client initialized' <(pm2 logs abcotronics-erp --nostream --lines 100)"
echo "3. Test the API: curl https://abcoafrica.co.za/api/health"
echo ""
echo "⚠️  If you need to set JWT_SECRET, edit .env and run: pm2 restart abcotronics-erp --update-env"

