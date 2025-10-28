# HTTP/2 Protocol Error Fix

## Problem
The app is showing `ERR_HTTP2_PROTOCOL_ERROR` for all files, preventing the application from loading. This is caused by nginx's HTTP/2 configuration conflicting with the proxy setup.

## Solution

### Option 1: Run the Fix Script (Recommended)

SSH into your server and run:

```bash
bash fix-http2-errors.sh
```

This script will:
- Backup your current nginx config
- Disable HTTP/2
- Add proper proxy buffer configurations
- Reload nginx

### Option 2: Manual Fix

If you can't run the script, manually update nginx:

```bash
# SSH into your server first
ssh root@your-server-ip

# Edit nginx config
nano /etc/nginx/sites-available/abcotronics-erp
```

Find this line:
```nginx
listen 443 ssl http2;
```

Change it to:
```nginx
listen 443 ssl;
```

Then add these lines inside the `server { }` block before the `location /` block:
```nginx
# Increase buffer sizes
proxy_buffer_size 128k;
proxy_buffers 4 256k;
proxy_busy_buffers_size 256k;
proxy_temp_file_write_size 256k;
```

And update the `location /` block to disable buffering:
```nginx
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
    
    # Timeouts
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
    
    # Disable buffering
    proxy_buffering off;
    proxy_request_buffering off;
    
    # Cache bypass
    proxy_cache_bypass $http_upgrade;
    proxy_no_cache $http_upgrade;
}
```

Save and exit (Ctrl+X, then Y, then Enter).

Test and reload:
```bash
nginx -t && systemctl reload nginx
```

## Why This Works

HTTP/2 can cause protocol errors when:
1. Nginx tries to use HTTP/2 push features that aren't compatible
2. Buffer sizes are too small for large JavaScript files
3. Proxy buffering conflicts with HTTP/2 streaming

By disabling HTTP/2 and properly configuring buffers, all files should load correctly.

## Verification

After applying the fix:
1. Hard refresh your browser (Ctrl+Shift+R or Cmd+Shift+R)
2. Check the browser console - you should no longer see ERR_HTTP2_PROTOCOL_ERROR
3. The App component should load and mount properly

## Rollback

If something goes wrong, you can restore the backup:
```bash
RESTORE_FILE=$(ls -t /etc/nginx/sites-available/abcotronics-erp.backup.* | head -1)
cp "$RESTORE_FILE" /etc/nginx/sites-available/abcotronics-erp
nginx -t && systemctl reload nginx
```

