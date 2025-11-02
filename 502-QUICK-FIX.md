# 502 Bad Gateway - Quick Fix Guide

## Immediate Action Required

Your site `https://abcoafrica.co.za` is returning 502 Bad Gateway errors, which means nginx is running but can't connect to the Node.js server.

## Quick Fix (Run on Server)

SSH into your server and run:

```bash
ssh root@abcoafrica.co.za
cd /var/www/abcotronics-erp
```

### Option 1: Use the Diagnostic Script (Recommended)

```bash
# Upload and run the fix script
bash fix-502-immediate.sh
```

### Option 2: Manual Restart

```bash
# Check PM2 status
pm2 status

# If app is not running, restart it
pm2 restart abcotronics-erp

# If app doesn't exist in PM2, start it
cd /var/www/abcotronics-erp
pm2 start server.js --name abcotronics-erp
pm2 save

# Verify it's working
curl http://127.0.0.1:3000/health
```

### Option 3: Quick Restart Commands

```bash
# Restart PM2 app
pm2 restart all

# Or restart nginx if it's a proxy issue
sudo systemctl restart nginx

# Check logs
pm2 logs abcotronics-erp --lines 50
```

## Common Causes

1. **Server Process Crashed**: Node.js server stopped running
2. **Port Not Listening**: Server not binding to port 3000
3. **Database Connection Lost**: Server can't connect to database
4. **Out of Memory**: Server killed due to memory issues
5. **Syntax Error**: Recent code changes causing server crash

## Diagnostic Steps

### 1. Check if Server is Running

```bash
# Check processes
ps aux | grep node

# Check port
sudo netstat -tlnp | grep :3000
# OR
sudo ss -tlnp | grep :3000
```

### 2. Test Server Directly (Bypass Nginx)

```bash
# Should return JSON
curl http://127.0.0.1:3000/health

# Should return HTML
curl http://127.0.0.1:3000/
```

### 3. Check PM2 Logs

```bash
pm2 logs abcotronics-erp --lines 100
```

Look for:
- Error messages
- Database connection errors
- Syntax errors
- Port binding errors

### 4. Check Nginx Logs

```bash
sudo tail -50 /var/log/nginx/error.log
```

Look for:
- "upstream prematurely closed connection"
- "connect() failed (111: Connection refused)"
- "upstream timed out"

## If Server Won't Start

### Check Recent Changes

```bash
cd /var/www/abcotronics-erp
git log --oneline -10
git diff HEAD~1
```

### Check Environment Variables

```bash
# Verify .env file exists
cat .env | grep -E "DATABASE_URL|JWT_SECRET|PORT"
```

### Test Server Manually

```bash
cd /var/www/abcotronics-erp
node server.js
```

Watch for startup errors.

## Restart Nginx (if needed)

```bash
# Test nginx config
sudo nginx -t

# Restart nginx
sudo systemctl restart nginx

# Check status
sudo systemctl status nginx
```

## Verify Fix

After restarting:

1. **Test locally on server**:
   ```bash
   curl http://127.0.0.1:3000/health
   ```

2. **Test through nginx**:
   ```bash
   curl https://abcoafrica.co.za/health
   ```

3. **Check in browser**:
   - Visit: https://abcoafrica.co.za
   - Should load without 502 error

## Prevention

To prevent this in the future:

1. **Set up PM2 auto-restart**:
   ```bash
   pm2 startup systemd
   pm2 save
   ```

2. **Monitor with PM2**:
   ```bash
   pm2 monit
   ```

3. **Set up monitoring/alerts** for server crashes

## Still Not Working?

If the server still won't start:

1. Check server.js for syntax errors:
   ```bash
   node -c server.js
   ```

2. Check database connection:
   ```bash
   # Test database URL from .env
   node -e "console.log(process.env.DATABASE_URL)"
   ```

3. Check for port conflicts:
   ```bash
   sudo lsof -i :3000
   ```

4. Review recent git commits for breaking changes

