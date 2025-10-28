#!/bin/bash
# Script to access Prisma Studio on Digital Ocean server
# Run this on your LOCAL machine

SERVER_IP="165.22.127.196"  # Your droplet IP
SERVER_USER="root"
APP_DIR="/var/www/abcotronics-erp"

echo "🔗 Connecting to server and setting up Prisma Studio..."
echo ""
echo "📋 Instructions:"
echo "   1. This will start Prisma Studio on the server"
echo "   2. It will be accessible at http://localhost:5555 on your machine"
echo ""
echo "Press Ctrl+C when done to stop Prisma Studio"
echo ""

# SSH with port forwarding
ssh -L 5555:localhost:5555 $SERVER_USER@$SERVER_IP "
    cd $APP_DIR
    echo '🚀 Starting Prisma Studio...'
    npx prisma studio --port 5555
"

