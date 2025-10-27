# HTTPS Setup for abcoafrica.co.za

## Quick Setup Commands

### 1. Configure DNS at domains.co.za

Set A records pointing to `165.22.127.196`:
- `@` → `165.22.127.196`
- `www` → `165.22.127.196`

### 2. Update Nginx Configuration

On your droplet, run:

```bash
cat > /etc/nginx/sites-available/abcotronics-erp <<'EOF'
server {
    listen 80;
    server_name abcoafrica.co.za www.abcoafrica.co.za;
    
    location /.well-known/acme-challenge/ { root /var/www/html; }
    
    location /app {
        rewrite ^/app(/.*)$ $1 break;
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    location / { return 404; }
}
EOF

nginx -t && systemctl reload nginx
```

### 3. Get SSL Certificate

After DNS propagates (5-15 minutes):

```bash
systemctl stop nginx
certbot certonly --standalone -d abcoafrica.co.za -d www.abcoafrica.co.za --agree-tos --register-unsafely-without-email
systemctl start nginx
```

### 4. Update Nginx for HTTPS

```bash
cat > /etc/nginx/sites-available/abcotronics-erp <<'EOF'
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
    
    location /app {
        rewrite ^/app(/.*)$ $1 break;
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    location / { return 404; }
}
EOF

nginx -t && systemctl reload nginx
```

## Your App Will Be At:

- **http://abcoafrica.co.za/app** (before SSL)
- **https://abcoafrica.co.za/app** (after SSL)

## Quick All-in-One Script

Save this and run it after DNS is configured:

```bash
# Configure DNS first at domains.co.za, then wait 5-15 minutes
# Then run these commands:

systemctl stop nginx

certbot certonly --standalone -d abcoafrica.co.za -d www.abcoafrica.co.za --agree-tos --register-unsafely-without-email

cat > /etc/nginx/sites-available/abcotronics-erp <<'EOF'
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
    
    location /app {
        rewrite ^/app(/.*)$ $1 break;
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    location / { return 404; }
}
EOF

systemctl start nginx
nginx -t && systemctl reload nginx

echo "✅ Done! Visit: https://abcoafrica.co.za/app"
```
