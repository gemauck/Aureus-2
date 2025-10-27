# Fix 404 Error on https://abcoafrica.com/app

## Quick Diagnostic Commands

Run these on your droplet to diagnose the issue:

### 1. Check if your app is running
```bash
pm2 status
```

If your app is not running, start it:
```bash
pm2 start all
pm2 save
```

### 2. Check if your app is accessible directly on port 3000
```bash
curl http://localhost:3000
```

If this works, you should see HTML from your app. If not, your app isn't running or there's an issue with it.

### 3. Check Nginx configuration
```bash
cat /etc/nginx/sites-available/abcotronics-erp
```

Look for the `/app` location block and make sure it has:
```
location /app {
    rewrite ^/app(/.*)$ $1 break;
    proxy_pass http://localhost:3000;
    ...
}
```

### 4. Check Nginx error logs
```bash
tail -20 /var/log/nginx/error.log
```

This will show you what error Nginx is encountering.

### 5. Test the Nginx configuration
```bash
nginx -t
```

## Common Issues and Solutions

### Issue 1: App is not running on port 3000

**Check:**
```bash
pm2 status
netstat -tlnp | grep 3000
```

**Solution:**
```bash
# Find where your app is located
cd /var/www/abcotronics-erp  # or wherever your app is

# Start the app
pm2 start server.js --name abcotronics-erp
pm2 save
pm2 startup
```

### Issue 2: Nginx location block is wrong

The location block should be:

```bash
cat > /etc/nginx/sites-available/abcotronics-erp <<'EOF'
server {
    listen 80;
    listen 443 ssl;
    server_name abcoafrica.com www.abcoafrica.com;
    
    ssl_certificate /etc/letsencrypt/live/abcoafrica.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/abcoafrica.com/privkey.pem;
    
    location /app {
        rewrite ^/app/(.*) /$1 break;
        rewrite ^/app$ / break;
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    location / {
        return 404;
    }
}
EOF

nginx -t && systemctl reload nginx
```

### Issue 3: Port 3000 is not accessible

**Check what's listening on port 3000:**
```bash
netstat -tlnp | grep 3000
```

**Or check what Node.js processes are running:**
```bash
ps aux | grep node
```

**If nothing is running:**
```bash
# Navigate to your app directory (adjust path as needed)
cd /var/www/abcotronics-erp

# Check if server.js exists
ls -la server.js

# Start the app manually to check for errors
node server.js
```

### Issue 4: Permission issues

```bash
# Check if the app has permission to bind to port 3000
sudo -u nodeuser node server.js

# Or run as current user
node server.js
```

## Complete Fix - Rebuild Everything

If none of the above works, rebuild from scratch:

```bash
# 1. Check where your app is
ls -la /var/www/

# 2. Navigate to it
cd /var/www/abcotronics-erp

# 3. Make sure it's running
pm2 delete all
pm2 start server.js --name abcotronics-erp
pm2 save

# 4. Restart Nginx
systemctl restart nginx

# 5. Test
curl -I http://localhost:3000
curl -I https://abcoafrica.com/app
```

## Need More Help?

Run this and share the output:

```bash
echo "=== PM2 Status ===" && \
pm2 status && \
echo "=== Nginx Status ===" && \
systemctl status nginx | head -20 && \
echo "=== Port 3000 ===" && \
netstat -tlnp | grep 3000 && \
echo "=== Nginx Config ===" && \
cat /etc/nginx/sites-available/abcotronics-erp
```
