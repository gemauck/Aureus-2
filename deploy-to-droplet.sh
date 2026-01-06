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
# Helper to ensure key/value pairs exist in .env (quoted, idempotent)
ensure_env_var() {
    local key="$1"
    local value="$2"

    if [ -z "$key" ] || [ -z "$value" ]; then
        return
    fi

    local escaped_value
    escaped_value="$(printf '%s' "$value" | sed 's/\\/\\\\/g; s/"/\\"/g')"

    if grep -q "^${key}=" .env 2>/dev/null; then
        sed -i "s|^${key}=.*|${key}=\"${escaped_value}\"|" .env
    else
        printf '%s="%s"\n' "$key" "$escaped_value" >> .env
    fi
}

# Create baseline .env if missing
if [ ! -f .env ]; then
    echo "📄 Generating baseline .env file..."
    cat > .env << 'EOF'
NODE_ENV=production
PORT=3000
APP_URL="https://abcoafrica.co.za"
EOF
fi

# Always enforce NODE_ENV/PORT defaults
ensure_env_var "NODE_ENV" "${NODE_ENV:-production}"
ensure_env_var "PORT" "${PORT:-3000}"

# Sync critical secrets from current shell (export before running deploy script)
ENV_VARS_TO_SYNC=(
  DATABASE_URL
  JWT_SECRET
  APP_URL
  RESEND_API_KEY
  SENDGRID_API_KEY
  EMAIL_FROM
  EMAIL_REPLY_TO
  SMTP_HOST
  SMTP_PORT
  SMTP_USER
  SMTP_PASS
  SMTP_SECURE
  SMTP_URL
  GMAIL_USER
  GMAIL_APP_PASSWORD
  FORCE_SECURE_COOKIES
  REFRESH_COOKIE_DOMAIN
  ENABLE_LEAVE_EMAIL_NOTIFICATIONS
)

for VAR_NAME in "${ENV_VARS_TO_SYNC[@]}"; do
  VAR_VALUE="${!VAR_NAME}"
  if [ -n "$VAR_VALUE" ]; then
    ensure_env_var "$VAR_NAME" "$VAR_VALUE"
    echo "🔐 Synced $VAR_NAME into .env"
  fi
done

if ! grep -q "^DATABASE_URL=" .env 2>/dev/null; then
    echo "❌ DATABASE_URL not detected in shell or .env. Set DATABASE_URL before deploying."
    exit 1
fi

if ! grep -q "^JWT_SECRET=" .env 2>/dev/null; then
    echo "❌ JWT_SECRET missing. Export JWT_SECRET before running deployment."
    exit 1
fi

if grep -q "^RESEND_API_KEY=" .env 2>/dev/null; then
    echo "✅ Resend API key detected in .env"
elif grep -q "^SENDGRID_API_KEY=" .env 2>/dev/null; then
    echo "✅ SendGrid API key detected in .env"
else
    echo "⚠️  RESEND_API_KEY or SENDGRID_API_KEY not provided. Email delivery may fail until set."
fi

# Generate Prisma client
echo "🏗️  Generating Prisma client..."
npx prisma generate

# Push schema to database
echo "🗄️  Pushing database schema..."
./scripts/safe-db-migration.sh npx prisma db push || echo "⚠️  Database push failed - you may need to configure DATABASE_URL in .env"

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
      DATABASE_URL: process.env.DATABASE_URL,
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

# Start the application (reload if already running so new env applies)
echo "🚀 Starting application..."
if pm2 list | grep -q "abcotronics-erp"; then
  pm2 restart abcotronics-erp --update-env
else
  pm2 start server.js --name abcotronics-erp -i 1 --update-env
fi

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

