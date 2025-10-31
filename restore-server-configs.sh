#!/bin/bash
# Restore server configs from git commit fb29033 or known-good configs
# Run on droplet: bash restore-server-configs.sh

set -e

cd /var/www/abcotronics-erp

echo "📦 Backing up current configs..."
sudo cp -a /etc/nginx/sites-available/abcotronics-erp /etc/nginx/sites-available/abcotronics-erp.bak.$(date +%s) 2>/dev/null || true
pm2 save || true

echo "🔍 Checking for config files in git commit fb29033..."
CONFIG_FILES=$(git ls-tree -r --name-only fb29033 | grep -E '(ecosystem|nginx|setup\.sh)' || echo "")

if [ -n "$CONFIG_FILES" ]; then
    echo "Found config files: $CONFIG_FILES"
else
    echo "No config files in repo. Using known-good configs from docs..."
fi

# Restore NGINX from FINAL-WORKING-CONFIG.md (known-good)
echo "🔧 Restoring NGINX config from FINAL-WORKING-CONFIG.md..."
cat > /tmp/nginx-config-restore.conf <<'NGINX_EOF'
server {
    listen 80;
    server_name abcoafrica.co.za www.abcoafrica.co.za;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name abcoafrica.co.za www.abcoafrica.co.za;
    
    ssl_certificate /etc/letsencrypt/live/abcoafrica.co.za/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/abcoafrica.co.za/privkey.pem;
    
    client_max_body_size 20m;
    
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
        proxy_connect_timeout 5s;
        proxy_buffering off;
    }
}
NGINX_EOF
sudo cp /tmp/nginx-config-restore.conf /etc/nginx/sites-available/abcotronics-erp
rm /tmp/nginx-config-restore.conf

# Test and reload NGINX
echo "✅ Testing NGINX config..."
sudo nginx -t && sudo systemctl reload nginx && echo "✅ NGINX reloaded"

# Check for ecosystem config in repo
if git show fb29033:ecosystem.config.cjs >/dev/null 2>&1; then
    echo "📄 Found ecosystem.config.cjs in repo, restoring..."
    git show fb29033:ecosystem.config.cjs > ecosystem.config.cjs
    pm2 start ecosystem.config.cjs --only abcotronics-erp || pm2 reload ecosystem.config.cjs --only abcotronics-erp
elif git show fb29033:ecosystem.config.js >/dev/null 2>&1; then
    echo "📄 Found ecosystem.config.js in repo, converting to .cjs..."
    git show fb29033:ecosystem.config.js > ecosystem.config.cjs
    pm2 start ecosystem.config.cjs --only abcotronics-erp || pm2 reload ecosystem.config.cjs --only abcotronics-erp
else
    echo "ℹ️  No ecosystem config in repo. Ensuring PM2 is running..."
    pm2 restart abcotronics-erp || {
        echo "⚠️  PM2 restart failed, checking if app is listening..."
        sleep 2
        if ! ss -ltnp | grep -q ':3000'; then
            echo "🚀 Starting app with PM2..."
            PORT=3000 NODE_ENV=production APP_URL=https://abcoafrica.co.za pm2 start server.js --name abcotronics-erp
        else
            echo "✅ App is already running on port 3000"
        fi
    }
fi

# Wait for app to be ready
echo "⏳ Waiting for app to be ready..."
sleep 3

pm2 save

echo ""
echo "🔍 Verifying health endpoints..."
echo "--- Local health ---"
curl -sS -i http://127.0.0.1:3000/health | head -5 || echo "❌ Local health check failed"
echo ""
echo "--- HTTPS health ---"
curl -sS -I https://abcoafrica.co.za/health | head -5 || echo "❌ HTTPS health check failed"

echo ""
echo "✅ Config restore complete!"
echo "📊 PM2 status:"
pm2 ls
