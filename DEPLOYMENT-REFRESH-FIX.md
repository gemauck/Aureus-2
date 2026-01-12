# Deployment Refresh Fix - Ensuring Deployments Are Visible

## Problem

Recent deployments were not being enacted or refreshed on the web app. Users were seeing old cached versions even after new deployments.

## Root Causes Identified

1. **Cache-busting versions in `index.html` were hardcoded** and not updated during deployment
2. **Nginx was caching static assets** (CSS, JS) for 30 days with `Cache-Control: public, immutable`
3. **Version endpoint** was using timestamps that changed on every server restart, not just deployments
4. **Build version** in HTML wasn't being updated during deployment

## Solution Implemented

### 1. Automatic Cache Version Updates (`scripts/update-cache-versions.js`)

Created a script that automatically updates all cache-busting versions in `index.html` during deployment:

- Updates `APP_VERSION` in cache clearing script
- Updates `BUILD_VERSION` timestamp
- Updates all `?v=` query parameters in asset URLs
- Updates `VITE_PROJECTS_VERSION`
- Uses git commit hash + date for stable versioning

### 2. Updated Deployment Script (`deploy-production.sh`)

The deployment script now:

1. **Updates cache versions BEFORE building** (local)
2. **Sets `APP_VERSION` and `APP_BUILD_TIME` environment variables**
3. **Updates cache versions on server** after git pull
4. **Clears Nginx cache** before restarting
5. **Sets version in PM2** for persistence

### 3. Improved Version Endpoint (`server.js`)

The `/version` endpoint now:

- Uses `APP_VERSION` environment variable (set by deployment script)
- Falls back to git commit hash (more stable than timestamp)
- Only changes on actual deployments, not server restarts

### 4. Nginx Cache Clearing (`scripts/clear-nginx-cache.sh`)

Created a script to clear Nginx cache and reload configuration after deployment.

## How It Works

### During Deployment

1. **Local**: Script updates all cache-busting versions in `index.html`
2. **Build**: CSS and JSX are built with new version references
3. **Deploy**: Files are synced to server
4. **Server**: Cache versions are updated again (in case of conflicts)
5. **Cache Clear**: Nginx cache is cleared
6. **Restart**: PM2 restarts with new `APP_VERSION` environment variable

### Client-Side Detection

1. **Version Polling**: Client checks `/version` endpoint every 60 seconds
2. **Version Mismatch**: If stored version ≠ server version, shows update banner
3. **Cache Clearing**: On reload, cache clearing script detects version mismatch
4. **Hard Reload**: Forces browser to fetch fresh HTML and assets

## Usage

### Normal Deployment

```bash
./deploy-production.sh
```

The script automatically:
- Updates cache versions
- Builds assets
- Deploys to server
- Clears cache
- Restarts application

### Manual Cache Version Update

If you need to update cache versions manually:

```bash
node scripts/update-cache-versions.js
```

### Manual Nginx Cache Clear

If you need to clear Nginx cache manually:

```bash
./scripts/clear-nginx-cache.sh
```

Or on the server:

```bash
ssh root@abcoafrica.co.za
cd /var/www/abcotronics-erp
./scripts/clear-nginx-cache.sh
```

## Testing After Deployment

### 1. Check Version Endpoint

```bash
curl https://abcoafrica.co.za/version
```

Should return:
```json
{
  "version": "20250115-abc1234",
  "buildTime": "2025-01-15T10:30:00Z"
}
```

### 2. Check Browser Console

Open browser console and check:
- Version check logs: `🔍 Version check: { stored, latest, dismissed }`
- Cache clearing logs: `🧹 Force clearing cache on page load...`
- Version mismatch detection: `✅ New version detected!`

### 3. Hard Refresh

After deployment, users should:
- See update banner (if version changed)
- Click "Reload now" or use hard refresh (`Cmd+Shift+R` / `Ctrl+Shift+R`)
- Verify new features are visible

## Troubleshooting

### Deployments Still Not Showing

1. **Check version endpoint**:
   ```bash
   curl https://abcoafrica.co.za/version
   ```
   Version should match the deployment date + git hash.

2. **Check PM2 environment**:
   ```bash
   ssh root@abcoafrica.co.za
   pm2 env abcotronics-erp | grep APP_VERSION
   ```
   Should show the deployment version.

3. **Clear browser cache manually**:
   - Open DevTools (F12)
   - Right-click refresh button
   - Select "Empty Cache and Hard Reload"

4. **Check Nginx cache**:
   ```bash
   ssh root@abcoafrica.co.za
   ls -la /var/cache/nginx/
   ```
   Should be empty or recently cleared.

5. **Force cache clear via URL**:
   ```
   https://abcoafrica.co.za/?clearCache
   ```

### Version Not Updating

1. **Check git commit hash**:
   ```bash
   git rev-parse --short HEAD
   ```

2. **Check deployment script output**:
   Look for: `✅ Cache versions updated: YYYYMMDD-abc1234`

3. **Verify index.html was updated**:
   ```bash
   grep "APP_VERSION" index.html
   ```
   Should show the new version.

### Nginx Cache Issues

1. **Check Nginx configuration**:
   ```bash
   ssh root@abcoafrica.co.za
   nginx -t
   ```

2. **Reload Nginx**:
   ```bash
   systemctl reload nginx
   ```

3. **Check static asset headers**:
   ```bash
   curl -I https://abcoafrica.co.za/dist/styles.css
   ```
   Should show `Cache-Control: no-cache, must-revalidate` (not `immutable`)

## Files Changed

1. **`scripts/update-cache-versions.js`** - NEW: Auto-updates cache versions
2. **`scripts/clear-nginx-cache.sh`** - NEW: Clears Nginx cache
3. **`deploy-production.sh`** - UPDATED: Runs version updates and cache clearing
4. **`server.js`** - UPDATED: Improved version detection using git hash

## Prevention

To prevent this issue in the future:

1. **Always use `deploy-production.sh`** - Don't deploy manually
2. **Check version endpoint after deployment** - Verify it updated
3. **Monitor deployment logs** - Look for cache version update messages
4. **Test in incognito mode** - Ensures no browser cache interference

## Success Criteria

✅ Version endpoint returns deployment date + git hash  
✅ Browser shows update banner when version changes  
✅ Hard refresh loads fresh assets  
✅ Nginx cache is cleared after deployment  
✅ PM2 has `APP_VERSION` environment variable set  

## Next Steps

1. Run deployment: `./deploy-production.sh`
2. Verify version endpoint: `curl https://abcoafrica.co.za/version`
3. Test in browser: Hard refresh and verify new features
4. Monitor logs: Check for any cache-related warnings

---

**Status**: ✅ Fix implemented and ready for deployment  
**Date**: 2025-01-15





