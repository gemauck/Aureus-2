# Final Fix - IPv6 Connection Issue

## The Problem

Nginx is trying to connect to `[::1]:3000` (IPv6 localhost) but your app is on `127.0.0.1:3000` (IPv4).

## Solution - Update Nginx Config

Run this on your droplet:

```bash
cat > /etc/nginx/sites-available/abcotronics-erp <<'EOF'
server {
    listen 80;
    server_name abcoafrica.co.za www.abcoafrica.co.za;
    
    location /app {
        rewrite ^/app/(.*) /$1 break;
        rewrite ^/app$ / break;
        proxy_pass http://127.0.0.1:3000;  # Force IPv4
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

## Test It

```bash
curl http://localhost/app
```

This should now return HTML from your app!

Then visit: **http://abcoafrica.co.za/app**

The key change: `proxy_pass http://127.0.0.1:3000;` (IPv4) instead of `http://localhost:3000;` (which resolves to IPv6).
