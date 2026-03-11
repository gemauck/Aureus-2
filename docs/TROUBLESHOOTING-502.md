# Troubleshooting 502 Bad Gateway (abcoafrica.co.za)

## What 502 means

**502 Bad Gateway** means nginx (or your reverse proxy) did not get a valid response from the upstream **Node.js app** (PM2). It does **not** mean the file or API is missing; it usually means:

- The Node process is slow, crashed, or not accepting connections
- Nginx gave up waiting (timeout)
- Too many concurrent requests to Node (e.g. if static files are proxied through Node)

## Quick server checks (SSH)

Run these on the server (e.g. `ssh root@165.22.127.196` or your droplet):

```bash
# 1. Is the app running?
pm2 status
pm2 list

# 2. Recent logs (crashes, errors)
pm2 logs abcotronics-erp --lines 100

# 3. Nginx error log (upstream errors, timeouts)
tail -100 /var/log/nginx/abcotronics-erp.error.log

# 4. Memory / load (if Node is OOM or CPU-bound)
free -h
# Optional: node memory
pm2 show abcotronics-erp | grep -E "memory|restart"
```

## Ensure static files don’t hit Node

If **both** `/api/*` and `/dist/*` (and other static assets) return 502, Node may be overloaded because nginx is sending **all** requests (including static JS/CSS) to Node.

**Fix:** Serve `/dist/` (and other static paths) **directly from disk** in nginx so only HTML and API go to Node.

In your nginx server block (e.g. `/etc/nginx/sites-available/abcotronics-erp`), add a **location for /dist** (and optionally `/styles`, `/assets`) **before** any `location /` that proxies to Node:

```nginx
# Serve built JS/CSS/images from disk so Node is not hit for every lazy-loaded file
location /dist/ {
    alias /var/www/abcotronics-erp/dist/;
    expires 7d;
    add_header Cache-Control "public, immutable";
}

# If you use a catch-all proxy for /, keep try_files so static files are tried first
location / {
    try_files $uri $uri/ /index.html;
    # Only if the file is not on disk, proxy to Node (for SPA fallback)
    # If your current config is only proxy_pass, consider adding try_files as above
}
```

Then:

```bash
nginx -t && systemctl reload nginx
```

After this, requests to `https://abcoafrica.co.za/dist/...` are served by nginx from disk and should stop returning 502 when Node is under load.

## If API still returns 502

Then the problem is Node itself (or nginx → Node):

1. **Timeouts**  
   In nginx, under `location /api/`, increase timeouts, e.g.:
   ```nginx
   proxy_connect_timeout 90s;
   proxy_send_timeout 90s;
   proxy_read_timeout 90s;
   ```

2. **Node slow or crashing**  
   - Check `pm2 logs` for uncaught errors, DB timeouts, or OOM  
   - Restart: `pm2 restart abcotronics-erp`  
   - If the app uses a DB, verify it’s reachable and not timing out

3. **Too many connections**  
   - PM2 cluster: ensure multiple instances if configured (e.g. in `ecosystem.config.js`)  
   - Nginx upstream: keepalive and multiple `server` entries are already in `deploy/nginx.conf`

## Client-side behaviour you’re seeing

- The app **retries** lazy-loaded scripts (e.g. “attempt 1/3, retrying in 100ms”), so after some 502s requests eventually succeed.
- API fallbacks (e.g. “falling back to localStorage”) occur when the API returns 502.

Improving server and nginx as above should reduce 502s so that retries and fallbacks are rarely needed.

## Reference

- `deploy/nginx.conf` – reference config with `try_files` and `/dist/` from disk
- `deploy-502-fix.sh` / `deploy-projects-502-fix.sh` – previous 502 fixes (API error handling)
