#!/bin/bash
# Quick setup - tries multiple methods to create database

echo "🚀 Quick Local Development Setup"
echo ""

DB_NAME="abcotronics_erp_local"
USER=$(whoami)

echo "Trying to create database: $DB_NAME"
echo ""

# Method 1: Try createdb without password (if trust is already set)
if createdb "$DB_NAME" 2>/dev/null; then
    echo "✅ Database created successfully!"
    METHOD="direct"
elif psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
    echo "✅ Database already exists"
    METHOD="exists"
else
    echo "⚠️  Direct creation failed"
    METHOD="failed"
fi

# If direct method failed, provide instructions
if [ "$METHOD" = "failed" ]; then
    echo ""
    echo "❌ Could not create database automatically"
    echo ""
    echo "You need to fix PostgreSQL authentication first."
    echo ""
    echo "Run this command (you'll be prompted for your macOS password):"
    echo ""
    echo "  sudo bash -c 'echo \"local   all   all   trust\" > /tmp/pg_trust.txt && cat /tmp/pg_trust.txt /Library/PostgreSQL/18/data/pg_hba.conf | grep -v \"^local.*all.*all.*trust\" > /tmp/pg_hba_new.txt && mv /tmp/pg_hba_new.txt /Library/PostgreSQL/18/data/pg_hba.conf && launchctl unload /Library/LaunchDaemons/com.edb.launchd.postgresql-18.plist && launchctl load /Library/LaunchDaemons/com.edb.launchd.postgresql-18.plist'"
    echo ""
    echo "Or manually:"
    echo "  1. sudo nano /Library/PostgreSQL/18/data/pg_hba.conf"
    echo "  2. Add 'local   all   all   trust' at the top"
    echo "  3. sudo launchctl unload /Library/LaunchDaemons/com.edb.launchd.postgresql-18.plist"
    echo "  4. sudo launchctl load /Library/LaunchDaemons/com.edb.launchd.postgresql-18.plist"
    echo "  5. createdb abcotronics_erp_local"
    exit 1
fi

# Create .env.local
echo ""
echo "📝 Creating .env.local..."

cat > .env.local << EOF
# Local Development Environment
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:3000

# Local PostgreSQL Database
DATABASE_URL="postgresql://${USER}@localhost:5432/${DB_NAME}"

# JWT Secret
JWT_SECRET=0266f788ee2255e2aa973f0984903fb61f3fb1d9f528b315c9dbd0bf53fe5ea8

# Allow local database connections
DEV_LOCAL_NO_DB=false

# Email Configuration
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
export DATABASE_URL="postgresql://${USER}@localhost:5432/${DB_NAME}"

npx prisma db push --accept-data-loss 2>&1 | tail -10

echo ""
echo "✅ Setup complete!"
echo ""
echo "Start dev server: npm run dev"
echo ""

