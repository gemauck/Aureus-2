#!/bin/bash
# Simple one-command fix for 504 timeout
# This will prompt for your SSH password

DROPLET_IP=$(cat .droplet_ip | tr -d ' \t\r')

echo "🔧 Fixing 504 Gateway Timeout..."
echo "You will be prompted for your SSH password"
echo ""

# Upload and run the fix script in one command
cat scripts/fix-504-timeout.sh | ssh root@${DROPLET_IP} 'bash -s'

echo ""
echo "✅ Done! Try uploading your file again."
