#!/bin/bash
# Configure Droplet to Always Use Digital Ocean Database
# This script ensures the production droplet always connects to the Digital Ocean database

set -e

DROPLET_IP="165.22.127.196"
APP_DIR="/var/www/abcotronics-erp"

# Digital Ocean Database Connection Details
# Password should be provided via environment variable or Digital Ocean connection string
DB_USER="doadmin"
DB_PASSWORD="${DB_PASSWORD:-}"  # Get from environment or prompt
DB_HOST="dbaas-db-6934625-nov-3-backup-nov-3-backup4-nov-6-backup-do-use.l.db.ondigitalocean.com"
DB_PORT="25060"
DB_NAME="defaultdb"

# If password not set, prompt for it
if [ -z "$DB_PASSWORD" ]; then
    echo "🔐 Please enter your Digital Ocean database password:"
    read -s DB_PASSWORD
    echo ""
fi

DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=require"

echo "🔧 Configuring Droplet to Use Digital Ocean Database"
echo "====================================================="
echo "📍 Droplet: $DROPLET_IP"
echo "🗄️  Database: $DB_HOST"
echo ""

ssh root@$DROPLET_IP << ENDSSH
set -e

echo "✅ Connected to droplet"
cd $APP_DIR

# Backup existing .env file
if [ -f .env ]; then
    echo "📦 Backing up existing .env file..."
    cp .env .env.backup.\$(date +%Y%m%d_%H%M%S)
    echo "✅ Backup created"
fi

# Create/Update .env file with Digital Ocean database
echo "📝 Updating .env file with Digital Ocean database..."
cat > .env << EOF
# Production Environment Variables
NODE_ENV=production
PORT=3000

# Digital Ocean Database - DO NOT CHANGE TO LOCAL
DATABASE_URL="${DATABASE_URL}"

# JWT Secret
JWT_SECRET=0266f788ee2255e2aa973f0984903fb61f3fb1d9f528b315c9dbd0bf53fe5ea8

# Application URL
APP_URL=https://abcoafrica.co.za
