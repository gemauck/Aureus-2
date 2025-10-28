# Deployment Instructions

## ✅ Code Already Pushed to GitHub

The following changes have been committed and pushed:
- ✅ Fixed server.js HTTP/2 headers
- ✅ Simplified app mounting logic  
- ✅ Added deployment scripts
- ✅ Improved error handling

## Step 1: Deploy Code to Server

Run these commands on your local machine:

```bash
# SSH into your server
ssh root@abcoafrica.co.za

# Navigate to app directory
cd /var/www/abcotronics-erp

# Pull latest changes
git pull origin main

# Restart the application
pm2 restart abcotronics-erp
# OR if using systemd:
# systemctl restart abcotronics-erp
```

## Step 2: Update Nginx Configuration

After deploying code, update nginx to fix HTTP/2 protocol errors:

```bash
# On your local machine, upload the fix script
scp deploy-http2-jsx-fix.sh root@abcoafrica.co.za:/root/

# SSH into server
ssh root@abcoafrica.co.za

# Make script executable and run it
chmod +x /root/deploy-http2-jsx-fix.sh
/root/deploy-http2-jsx-fix.sh
```

The script will:
- Backup current nginx config
- Update with JSX-specific HTTP/2 settings
- Test and reload nginx

## Step 3: Test

1. Hard refresh browser: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
2. Check browser console - should see:
   - ✅ No HTTP/2 protocol errors
   - ✅ App mounts within 1-3 seconds
   - ✅ "✅ App mounted successfully" message

## Troubleshooting

If app still doesn't load:

1. **Check server logs:**
   ```bash
   ssh root@abcoafrica.co.za
   pm2 logs abcotronics-erp
   tail -f /var/log/nginx/error.log
   ```

2. **Verify code is deployed:**
   ```bash
   cd /var/www/abcotronics-erp
   git log -1 --oneline
   # Should show: "Fix: HTTP/2 protocol errors..."
   ```

3. **Check nginx config:**
   ```bash
   nginx -t
   # Should show: "syntax is ok"
   ```

4. **Test JSX file directly:**
   ```bash
   curl -I https://abcoafrica.co.za/src/App.jsx
   # Should return 200 OK with proper headers
   ```

## What Changed

### Server (server.js)
- Proper Content-Type headers set before response
- Content-Length for HTTP/2 compatibility
- No caching for JSX files

### Client (index.html)
- Simplified mount logic (no infinite retries)
- Mounts within 1-3 seconds
- Clear error messages if components fail

### Nginx (deploy script)
- Special .jsx location block
- Larger HTTP/2 buffers
- No compression for JSX files
- Optimized proxy buffering

## Quick Deploy Commands

**Copy and paste this entire block:**

```bash
# Deploy code
ssh root@abcoafrica.co.za << 'EOF'
cd /var/www/abcotronics-erp
git pull origin main
pm2 restart abcotronics-erp
echo "✅ Code deployed"
EOF

# Deploy nginx fix
scp deploy-http2-jsx-fix.sh root@abcoafrica.co.za:/root/
ssh root@abcoafrica.co.za "chmod +x /root/deploy-http2-jsx-fix.sh && /root/deploy-http2-jsx-fix.sh"
```

