# Get SSL Certificate - DNS Validation Method

## The Problem

DNS is correct, but Let's Encrypt is connecting to the wrong IP (138.68.167.88) during validation. This is a secondary validation issue.

## Solution: Use DNS-01 Challenge Instead

We'll use DNS validation instead of HTTP validation.

### Step 1: Install Cloudflare DNS Plugin (or use manual DNS)

Since you're using domains.co.za, we'll use manual DNS validation:

```bash
certbot certonly --manual -d abcoafrica.com -d www.abcoafrica.com --agree-tos --register-unsafely-without-email
```

This will ask you to add a TXT record to your DNS. Follow the instructions.

### Step 2: Alternative - Use HTTP Validation Directly

First, check if port 80 is accessible:

```bash
# Check if port 80 is listening
netstat -tlnp | grep :80

# Check firewall
ufw status

# Make sure HTTP is allowed
ufw allow 80/tcp
```

### Step 3: Try Certbot with Webroot

```bash
# Create webroot directory if it doesn't exist
mkdir -p /var/www/html

# Get certificate using webroot
certbot certonly --webroot -w /var/www/html -d abcoafrica.com -d www.abcoafrica.com --agree-tos --register-unsafely-without-email

# This will store certificates in /etc/letsencrypt/live/abcoafrica.com/
```

### Step 4: Manually Update Nginx to use the certificate

Once you have the certificate:

```bash
# Edit Nginx config to use the certificate
cat > /etc/nginx/sites-available/abcotronics-erp <<'EOF'
server {
    listen 80;
    server_name abcoafrica.com www.abcoafrica.com;
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl http2;
    server_name abcoafrica.com www.abcoafrica.com;
    
    ssl_certificate /etc/letsencrypt/live/abcoafrica.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/abcoafrica.com/privkey.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    
    location /app {
        rewrite ^/app(/.*)$ $1 break;
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

## Quick Fix - Try This First

```bash
# Stop Nginx temporarily
systemctl stop nginx

# Get certificate in standalone mode
certbot certonly --standalone -d abcoafrica.com -d www.abcoafrica.com --agree-tos --register-unsafely-without-email

# Start Nginx
systemctl start nginx

# Configure Nginx with the certificate (use the config above)
```

## Verify Certificate

```bash
certbot certificates
ls -la /etc/letsencrypt/live/abcoafrica.com/
```

## Test Your HTTPS

```bash
curl -I https://abcoafrica.com/app
```

You should see "200 OK" or your app response.
