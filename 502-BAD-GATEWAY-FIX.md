# 502 Bad Gateway Error Fix

## Issue Summary

The application is experiencing 502 Bad Gateway errors from nginx for:
1. Manufacturing API endpoints (`/api/manufacturing/inventory`, `/api/manufacturing/boms`, etc.)
2. Static component files (`/dist/src/components/projects/*.js`)

## Root Cause Analysis

A 502 Bad Gateway error means nginx received an invalid response from the upstream Node.js server, or couldn't connect to it. Since other endpoints work (clients, projects, leads), the server IS running, so the issue is likely:

1. **Manufacturing Handler Crashes**: The `manufacturing.js` handler might be throwing uncaught errors
2. **Route Matching Issues**: The route pattern might not be matching correctly
3. **Timeout Issues**: Handlers might be taking too long (exceeding nginx timeout)
4. **Static File Serving**: Express static file serving might not be working correctly

## Fixes Applied

### 1. Enhanced Error Handling in server.js

Added comprehensive error handling and logging to the manufacturing route:
- Detailed logging of requests
- Better error catching and reporting
- Proper error response formatting

### 2. Check Server Status

First, verify the Node.js server is running:

```bash
# Check if Node.js process is running
ps aux | grep node

# Check if port 3000 is listening
sudo netstat -tlnp | grep :3000
# OR
sudo ss -tlnp | grep :3000

# Check server logs
pm2 logs
# OR
journalctl -u your-service-name -f
# OR
tail -f /path/to/server/logs
```

### 3. Restart the Server

If the server appears to be running but endpoints are failing, restart it:

```bash
# If using PM2
pm2 restart all
pm2 logs

# If using systemd
sudo systemctl restart your-service-name
sudo systemctl status your-service-name

# If running directly
# Kill the process and restart
```

### 4. Check Nginx Configuration

Verify nginx can connect to the backend:

```bash
# Test nginx configuration
sudo nginx -t

# Check nginx error logs
sudo tail -f /var/log/nginx/error.log

# Verify nginx can reach Node.js
curl http://127.0.0.1:3000/health
```

### 5. Test Manufacturing Endpoints Directly

Test the endpoints directly against the Node.js server (bypassing nginx):

```bash
# From the server itself
curl http://127.0.0.1:3000/api/manufacturing/inventory
curl http://127.0.0.1:3000/dist/src/components/projects/Projects.js
```

If these work locally but fail through nginx, the issue is in nginx configuration.

### 6. Check for Errors in manufacturing.js

The manufacturing handler might be crashing. Check:

```bash
# Check for syntax errors
node -c api/manufacturing.js

# Check for missing imports
node -e "import('./api/manufacturing.js').catch(e => console.error(e))"
```

### 7. Nginx Timeout Configuration

If handlers are taking too long, increase nginx timeouts:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
    
    # Add these for better error handling
    proxy_next_upstream error timeout http_502 http_503;
    proxy_next_upstream_tries 3;
}
```

## Immediate Actions

1. **Check server logs** for any errors related to manufacturing endpoints
2. **Restart the Node.js server** if it appears hung or crashed
3. **Test endpoints directly** against localhost:3000 to isolate nginx issues
4. **Review nginx error logs** for specific error messages

## Diagnostic Commands

Run these commands on your server to diagnose the issue:

```bash
# 1. Check if Node.js is running
ps aux | grep -E "node|pm2"

# 2. Test local endpoint (bypassing nginx)
curl -v http://127.0.0.1:3000/api/manufacturing/inventory

# 3. Check nginx can reach Node.js
curl -v http://127.0.0.1:3000/health

# 4. Check nginx error logs
sudo tail -50 /var/log/nginx/error.log

# 5. Check if files exist
ls -la dist/src/components/projects/Projects.js
ls -la api/manufacturing.js

# 6. Test static file serving
curl -v http://127.0.0.1:3000/dist/src/components/projects/Projects.js
```

## Expected Behavior After Fix

- Manufacturing API endpoints should return JSON responses (not 502)
- Static component files should load successfully
- No 502 errors in browser console for component loading
- Manufacturing module should load data correctly

## Next Steps

1. Deploy the updated `server.js` with enhanced error handling
2. Restart the Node.js server
3. Monitor logs for any new errors
4. Test the manufacturing endpoints
5. Test component loading

