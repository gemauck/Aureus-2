# Fix 404 Error on /app

## Diagnosis Commands

Run these on your droplet to check what's happening:

```bash
# Check if Nginx is running
systemctl status nginx

# Check if your app is running
pm2 status

# Check what's on port 3000
curl http://localhost:3000

# Check Nginx error logs
tail -20 /var/log/nginx/error.log

# Check Nginx config
cat /etc/nginx/sites-available/abcotronics-erp
```

## Common Issues

### Issue 1: App Not Running on Port 3000

If `curl http://localhost:3000` fails:

```bash
# Start your app
pm2 start server.js --name abcotronics-erp
pm2 save

# Or if you need to find where your app is:
find /var/www -name "server.js"
cd /path/to/your/app
pm2 start server.js
```

### Issue 2: Nginx Config Wrong

Update Nginx config:

```bash
cat > /etc/nginx/sites-available/abcotronics-erp <<'EOF'
server {
    listen 80;
    server_name abcoafrica.co.za www.abcoafrica.co.za;
    
    location /app {
        rewrite ^/app/(.*) /$1 break;
        rewrite ^/app$ / break;
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass $http_upgrade;
    }
    
    location / {
        return 404;
    }
}
EOF

nginx -t && systemctl reload nginx
```

### Issue 3: Wrong Path in Server

Check if your Node.js server is configured for the `/app` path. The server.js might need to be aware of the base path.

## Quick Fix - Test Everything

```bash
# 1. Check if app is running
pm2 list

# 2. If not, start it
cd /var/www/abcotronics-erp  # or wherever your app is
pm2 start server.js --name abcotronics-erp

# 3. Test locally
curl http://localhost:3000

# 4. Test through Nginx
curl http://localhost/app

# 5. Check logs
pm2 logs --lines 50
tail -20 /var/log/nginx/access.log
```

## Share Output

Run this and share the output:

```bash
echo "=== PM2 Status ===" && pm2 status && \
echo "=== Nginx Status ===" && systemctl status nginx | head -5 && \
echo "=== Local Test ===" && curl -I http://localhost:3000 && \
echo "=== Config ===" && cat /etc/nginx/sites-available/abcotronics-erp
```

This will help identify the exact issue.
