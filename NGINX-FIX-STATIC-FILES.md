# Fix Static File Serving

## The Problem
Static files (CSS, JS) are being requested from the root `/` but they're being served from `/app`.

## Solution - Update Nginx Config

Run this on your droplet:

```bash
cat > /etc/nginx/sites-available/abcotronics-erp <<'EOF'
server {
    listen 80;
    server_name abcoafrica.co.za;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name abcoafrica.co.za;
    
    ssl_certificate /etc/letsencrypt/live/abcoafrica.co.za/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/abcoafrica.co.za/privkey.pem;
    
    # Serve static files from Node.js app
    location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Serve the app
    location /app/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Prefix /app;
    }
    
    location /app {
        return 301 /app/;
    }
    
    # Redirect root to /app
    location = / {
        return 301 /app/;
    }
    
    location / {
        return 404;
    }
}
EOF

nginx -t && systemctl reload nginx
```

## Alternative: Check What Your App Expects

The app might be configured for root `/` instead of `/app`. Let's check:

```bash
curl http://localhost:3000/
```

If that returns HTML, the app is serving from root and doesn't expect `/app` prefix.
