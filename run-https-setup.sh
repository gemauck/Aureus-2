#!/bin/bash
# Helper script to upload and run HTTPS setup on server

set -e

DROPLET_IP="165.22.127.196"
SCRIPT_NAME="setup-https-abcoafrica.sh"

echo "🚀 HTTPS Setup Deployment"
echo "========================"
echo ""

# Check if script exists
if [ ! -f "$SCRIPT_NAME" ]; then
    echo "❌ Error: $SCRIPT_NAME not found"
    exit 1
fi

echo "📤 Step 1: Uploading script to server..."
echo "   This will prompt for your SSH password"
scp "$SCRIPT_NAME" root@$DROPLET_IP:/root/

echo ""
echo "✅ Script uploaded successfully!"
echo ""
echo "📋 Step 2: Next, run these commands:"
echo ""
echo "   ssh root@$DROPLET_IP"
echo "   chmod +x $SCRIPT_NAME"
echo "   ./$SCRIPT_NAME"
echo ""
echo "Or run this single command:"
echo "   ssh root@$DROPLET_IP 'chmod +x $SCRIPT_NAME && ./$SCRIPT_NAME'"
echo ""

read -p "Do you want to SSH in and run the script now? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🔐 Connecting to server..."
    ssh root@$DROPLET_IP "chmod +x $SCRIPT_NAME && ./$SCRIPT_NAME"
else
    echo "You can run the script manually by SSH'ing into the server."
fi

