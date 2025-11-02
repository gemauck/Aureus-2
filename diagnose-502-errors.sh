#!/bin/bash
# Diagnostic script for 502 Bad Gateway errors
# Run this on your server to diagnose the issue

echo "🔍 Diagnosing 502 Bad Gateway Errors..."
echo ""

echo "1. Checking Node.js process..."
ps aux | grep -E "node|pm2" | grep -v grep
echo ""

echo "2. Checking if port 3000 is listening..."
sudo netstat -tlnp | grep :3000 || sudo ss -tlnp | grep :3000
echo ""

echo "3. Testing health endpoint (bypassing nginx)..."
curl -v http://127.0.0.1:3000/health 2>&1 | head -20
echo ""

echo "4. Testing manufacturing endpoint directly..."
curl -v http://127.0.0.1:3000/api/manufacturing/inventory 2>&1 | head -30
echo ""

echo "5. Testing static file serving..."
curl -v http://127.0.0.1:3000/dist/src/components/projects/Projects.js 2>&1 | head -30
echo ""

echo "6. Checking nginx error logs (last 20 lines)..."
sudo tail -20 /var/log/nginx/error.log
echo ""

echo "7. Checking if files exist..."
echo "Manufacturing handler:"
ls -la api/manufacturing.js 2>&1
echo "Projects component:"
ls -la dist/src/components/projects/Projects.js 2>&1
echo ""

echo "8. Checking nginx configuration..."
sudo nginx -t 2>&1
echo ""

echo "9. Testing through nginx (should fail if issue is nginx)..."
curl -v https://abcoafrica.co.za/health 2>&1 | head -20
echo ""

echo "✅ Diagnostic complete!"
echo ""
echo "Next steps:"
echo "- If localhost:3000 works but nginx fails → nginx configuration issue"
echo "- If localhost:3000 fails → Node.js server issue"
echo "- Check logs above for specific error messages"

