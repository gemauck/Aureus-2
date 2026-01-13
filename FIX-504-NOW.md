# Quick Fix for 504 Gateway Timeout

## Problem
Your Excel file upload is timing out because nginx's 60-second timeout is too short for the Python processing (which can take 2-3 minutes).

## Solution - Run These Commands on Your Server

SSH into your server and run these commands:

```bash
# 1. SSH into your server
ssh root@64.227.32.244

# 2. Find your nginx config file
SITE_FILE=$(grep -R -l "server_name.*abcoafrica.co.za" /etc/nginx/sites-enabled/ /etc/nginx/sites-available/ | head -n1)
echo "Config file: $SITE_FILE"

# 3. Backup the config
cp "$SITE_FILE" "$SITE_FILE.backup.$(date +%Y%m%d%H%M%S)"

# 4. Edit the config
nano "$SITE_FILE"
```

## What to Add/Change in the Config File

### In the `location /` block, add these lines after `proxy_pass`:

```nginx
        # Increased timeouts for file uploads and long-running operations
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
```

### In the `server { }` block (at the top, after `server {`), add:

```nginx
    # Allow larger file uploads (50MB)
    client_max_body_size 50M;
    client_body_timeout 300s;
```

### Example of what it should look like:

```nginx
server {
    listen 443 ssl;
    server_name abcoafrica.co.za;
    
    # Allow larger file uploads (50MB)
    client_max_body_size 50M;
    client_body_timeout 300s;
    
    # ... SSL certificates ...
    
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        
        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        
        # Headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Increased timeouts for file uploads and long-running operations
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
        
        # ... rest of your config ...
    }
}
```

## After Editing

```bash
# 5. Test the configuration
nginx -t

# 6. If test passes, reload nginx
systemctl reload nginx

# 7. Verify the changes
grep -E "(proxy_read_timeout|client_max_body_size)" "$SITE_FILE"
```

## Alternative: Automated Script

If you prefer, you can copy this entire script and run it on your server:

```bash
#!/bin/bash
SITE_FILE=$(grep -R -l "server_name.*abcoafrica.co.za" /etc/nginx/sites-enabled/ /etc/nginx/sites-available/ | head -n1)
cp "$SITE_FILE" "$SITE_FILE.backup.$(date +%Y%m%d%H%M%S)"

# Add timeouts to location / block
sed -i '/proxy_pass.*;$/a\
        proxy_connect_timeout 300s;\
        proxy_send_timeout 300s;\
        proxy_read_timeout 300s;
' "$SITE_FILE"

# Add client_max_body_size to server block
if ! grep -q "client_max_body_size" "$SITE_FILE"; then
    sed -i '/^[[:space:]]*server[[:space:]]*{/a\
    client_max_body_size 50M;\
    client_body_timeout 300s;
' "$SITE_FILE"
fi

nginx -t && systemctl reload nginx && echo "✅ Fixed!"
```

## Verify It Worked

After applying the fix, try uploading your Excel file again. The 504 error should be gone!

## What This Does

- **proxy_read_timeout 300s**: Allows the upstream server (Node.js) to take up to 5 minutes to respond
- **proxy_send_timeout 300s**: Allows nginx to send data to upstream for up to 5 minutes
- **client_max_body_size 50M**: Allows file uploads up to 50MB
- **client_body_timeout 300s**: Allows clients to upload large files for up to 5 minutes

This matches the 5-minute timeout in your Python processing script (`api/poa-review/process.js` line 170).








