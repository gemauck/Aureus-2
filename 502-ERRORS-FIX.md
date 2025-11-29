# Fix for 502 Bad Gateway Errors on Component Loading

## Problem

The application is experiencing **502 Bad Gateway** errors when trying to lazy-load React components. The errors appear in the browser console like:

```
GET https://abcoafrica.co.za/dist/src/components/teams/ChecklistModal.js 502 (Bad Gateway)
GET https://abcoafrica.co.za/dist/src/components/manufacturing/Manufacturing.js 502 (Bad Gateway)
```

## Root Cause

The 502 errors typically indicate one of these issues:

1. **Missing Build Files**: The `dist/src/` directory doesn't exist or is incomplete on the production server
2. **Server Not Running**: The Node.js server (PM2) is not running or crashed
3. **Build Not Run**: The build process (`npm run build`) hasn't been executed after code changes
4. **Nginx Configuration**: The reverse proxy (nginx) is misconfigured or can't reach the Node.js server

## Solution

### Step 1: Diagnose the Issue

Run the diagnostic script to identify the specific problem:

```bash
./diagnose-502-errors.sh
```

This will check:
- Server connectivity
- PM2 process status
- Existence of `dist/src/` directory
- Presence of specific component files
- Server and nginx configuration
- HTTP accessibility of component files

### Step 2: Fix the Issue

Run the fix script to rebuild the component files:

```bash
./fix-502-component-errors.sh
```

This script will:
1. Check server status
2. Backup existing `dist/src/` directory (if it exists)
3. Run `npm run build` on the production server
4. Verify key component files were created
5. Restart the PM2 process
6. Test component file accessibility

### Step 3: Manual Fix (if scripts don't work)

If the automated scripts don't work, manually fix it:

```bash
# SSH to the server
ssh root@abcoafrica.co.za

# Navigate to app directory
cd /var/www/abcotronics-erp

# Check if server is running
pm2 status

# If not running, start it
pm2 start server.js --name abcotronics-erp

# Run the build
npm run build

# Verify files were created
ls -la dist/src/components/teams/ChecklistModal.js

# Restart the server
pm2 restart abcotronics-erp

# Check logs for errors
pm2 logs abcotronics-erp --lines 50
```

## Improved Error Messages

The lazy loader has been updated to provide more helpful error messages when 502 errors persist:

- It now explains that missing build files are the likely cause
- It suggests running `npm run build` on the production server
- It logs errors more clearly in the console

## Prevention

To prevent this issue in the future:

1. **Always run build after deployment**: Ensure `npm run build` is part of your deployment process
2. **Check build files in CI/CD**: Verify that `dist/src/` is included in deployments
3. **Monitor server status**: Set up monitoring for PM2 process health
4. **Test after deployment**: Verify component files are accessible after each deployment

## Verification

After fixing, verify the fix worked:

1. **Clear browser cache** and reload the application
2. **Check browser console** - 502 errors should be gone
3. **Test component loading** - Navigate to different sections (Teams, Manufacturing, Invoicing, etc.)
4. **Check server logs** - No errors related to missing files

## Related Files

- `lazy-load-components.js` - Component lazy loading logic (updated with better error messages)
- `diagnose-502-errors.sh` - Diagnostic script
- `fix-502-component-errors.sh` - Automated fix script
- `build-jsx.js` - Build script that creates `dist/src/` files
- `server.js` - Express server that serves static files from `dist/`

## Additional Notes

- The lazy loader already has retry logic (3 attempts with exponential backoff) for 502 errors
- Components that fail to load are skipped gracefully (they won't crash the app)
- Some components may still work if they're loaded from other sources (e.g., Vite modules)

