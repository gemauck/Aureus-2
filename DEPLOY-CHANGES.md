# Deployment Instructions - Sales Order Changes

## ✅ Changes Completed
1. **Client Field**: Changed to "Sale to Client *" with helper text
2. **Status Field**: Removed from sales order form
3. **Stock Movements**: Automatically created when sales order is processed

## ✅ Build Status
- **Build completed**: All JSX files compiled to `dist/`
- **Changes verified**: "Sale to Client" and stock movement code are in compiled file
- **File updated**: `dist/src/components/manufacturing/Manufacturing.js` (Nov 3 22:05)

## 🚀 Deployment Steps

### Option 1: If using Digital Ocean App Platform (Auto-deploy)
1. **Commit and push changes**:
   ```bash
   git add .
   git commit -m "Update sales order: client field, remove status, add stock movements"
   git push origin main
   ```
2. **Wait for auto-deploy** (2-3 minutes)
   - Digital Ocean will automatically rebuild and deploy

### Option 2: If using manual deployment/server
1. **SSH into your server**:
   ```bash
   ssh root@your-server-ip
   ```

2. **Navigate to app directory**:
   ```bash
   cd /var/www/abcotronics-erp  # or your app directory
   ```

3. **Pull latest changes**:
   ```bash
   git pull origin main
   ```

4. **Rebuild the application**:
   ```bash
   npm run build
   ```

5. **Restart the application**:
   ```bash
   # If using PM2:
   pm2 restart abcotronics-erp
   
   # Or if using systemd:
   sudo systemctl restart abcotronics-erp
   
   # Or if running directly:
   # Stop current process (Ctrl+C) and restart:
   npm start
   ```

### Option 3: If using Railway/Heroku
1. **Commit and push**:
   ```bash
   git add .
   git commit -m "Update sales order: client field, remove status, add stock movements"
   git push origin main
   ```
2. **Platform will auto-deploy** after detecting changes

## 🧹 Clear Browser Cache

After deployment, clear your browser cache to see changes:

### Chrome/Edge:
1. Press `Ctrl+Shift+Delete` (Windows) or `Cmd+Shift+Delete` (Mac)
2. Select "Cached images and files"
3. Click "Clear data"
4. Or hard refresh: `Ctrl+F5` (Windows) or `Cmd+Shift+R` (Mac)

### Firefox:
1. Press `Ctrl+Shift+Delete` (Windows) or `Cmd+Shift+Delete` (Mac)
2. Select "Cache"
3. Click "Clear Now"
4. Or hard refresh: `Ctrl+F5` (Windows) or `Cmd+Shift+R` (Mac)

### Safari:
1. Press `Cmd+Option+E` to empty cache
2. Or hard refresh: `Cmd+Option+R`

## ✅ Verify Changes

After deployment and cache clear:

1. **Navigate to Manufacturing → Sales Orders**
2. **Click "New Sales Order"**
3. **Verify**:
   - ✅ Label shows "Sale to Client *" (not "Client *")
   - ✅ Helper text: "This sales order will be sold to the selected client"
   - ✅ No "Status" field visible
   - ✅ Only: Order Date, Required Date, Priority fields
4. **Create a test sales order**:
   - Select a client
   - Add items
   - Save
   - Check browser console for stock movement logs
   - Verify stock movements were created

## 🔍 Troubleshooting

### Changes still not visible?

1. **Check build timestamp**:
   ```bash
   ls -lh dist/src/components/manufacturing/Manufacturing.js
   ```
   Should show recent timestamp (just now)

2. **Verify server is serving dist files**:
   - Check your server.js configuration
   - Ensure it's serving from `dist/` directory

3. **Check browser console**:
   - Open DevTools (F12)
   - Look for any JavaScript errors
   - Check Network tab - ensure Manufacturing.js is loading

4. **Force rebuild**:
   ```bash
   rm -rf dist
   npm run build
   ```

5. **Check git status**:
   ```bash
   git status
   git log --oneline -5
   ```
   Ensure changes are committed

## 📝 File Locations

- **Source**: `src/components/manufacturing/Manufacturing.jsx`
- **Compiled**: `dist/src/components/manufacturing/Manufacturing.js`
- **Build script**: `build-jsx.js`

## 🎯 Quick Test Command

To quickly verify changes are in the compiled file:
```bash
grep -n "Sale to Client" dist/src/components/manufacturing/Manufacturing.js
grep -n "type.*consumption" dist/src/components/manufacturing/Manufacturing.js
```

Both should return results if build was successful.

