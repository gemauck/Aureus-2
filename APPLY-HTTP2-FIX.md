# Apply HTTP/2 Fix - Quick Instructions

## The Problem
Your app is showing `ERR_HTTP2_PROTOCOL_ERROR` because nginx has HTTP/2 enabled but it's causing conflicts with the proxy setup.

## The Solution

### Step 1: SSH into your server
```bash
ssh root@your-server-ip
```

### Step 2: Download and run the quick fix
```bash
# Download the fix script (or copy quick-fix-http2.sh to your server first)
bash quick-fix-http2.sh
```

**OR** run these commands manually:

```bash
# Backup current config
cp /etc/nginx/sites-available/abcotronics-erp /etc/nginx/sites-available/abcotronics-erp.backup

# Edit the config
nano /etc/nginx/sites-available/abcotronics-erp
```

Find these lines and remove `http2`:
```nginx
listen 443 ssl http2;     →  listen 443 ssl;
listen [::]:443 ssl http2; → listen [::]:443 ssl;
```

Then add these lines BEFORE the `location /` block:
```nginx
# Increase buffer sizes
proxy_buffer_size 128k;
proxy_buffers 4 256k;
proxy_busy_buffers_size 256k;
proxy_temp_file_write_size 256k;
```

And add these lines INSIDE the `location /` block (after `proxy_read_timeout`):
```nginx
# Disable buffering
proxy_buffering off;
proxy_request_buffering off;
```

Save (Ctrl+X, Y, Enter) and reload:
```bash
nginx -t && systemctl reload nginx
```

### Step 3: Test
1. Open your browser
2. Hard refresh: Ctrl+Shift+R (or Cmd+Shift+R on Mac)
3. Check console - ERR_HTTP2_PROTOCOL_ERROR should be gone!

## What Changed?
- Removed HTTP/2 from nginx (using HTTPS/1.1 instead)
- Added proxy buffer configurations to handle large files
- Disabled proxy buffering to prevent streaming issues

This will fix all the HTTP/2 protocol errors you're seeing!

