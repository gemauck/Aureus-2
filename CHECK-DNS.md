# Check DNS Configuration

## Run These Commands to Diagnose

```bash
# Check what DNS shows for your domain
dig abcoafrica.co.za +short
dig www.abcoafrica.co.za +short

# Check from different DNS servers
nslookup abcoafrica.co.za 8.8.8.8
nslookup abcoafrica.co.za 1.1.1.1

# Check current server IP
curl ifconfig.me
```

## Expected Results

- Your droplet IP should be: `165.22.127.196`
- DNS should show: `165.22.127.196`

## If DNS Shows Wrong IP

Go to domains.co.za and:
1. Delete any existing A records for abcoafrica.co.za
2. Create new A records:
   - `@` → `165.22.127.196`
   - `www` → `165.22.127.196`
3. Wait 15-30 minutes for DNS to propagate

## Then Try Again

After DNS is correct (showing 165.22.127.196):

```bash
systemctl stop nginx
certbot certonly --standalone -d abcoafrica.co.za -d www.abcoafrica.co.za --agree-tos --register-unsafely-without-email
systemctl start nginx
```

## Alternative: Use HTTP Only for Now

If DNS keeps having issues, just use HTTP:

```bash
cat > /etc/nginx/sites-available/abcotronics-erp <<'EOF'
server {
    listen 80;
    server_name abcoafrica.co.za www.abcoafrica.co.za;
    
    location /app {
        rewrite ^/app(/.*)$ $1 break;
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
    }
    
    location / { return 404; }
}
EOF

nginx -t && systemctl reload nginx
systemctl start nginx
```

Then access: **http://abcoafrica.co.za/app**
