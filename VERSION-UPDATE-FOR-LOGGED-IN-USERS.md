# Version Update System for Logged-In Users

## Overview

The enhanced version detection system ensures that **all users, including those already logged in**, are notified when a new version of the app is deployed.

## How It Works

### 1. **Automatic Version Checks**

The system checks for new versions in multiple scenarios:

- **Periodic Polling**: Every 60 seconds, the app checks `/version` endpoint
- **Window Focus**: When user switches back to the browser tab
- **Navigation**: When user navigates between pages (Dashboard → Clients → Projects, etc.)
- **User Interactions**: After user clicks/interacts with the app (throttled to every 5 seconds)

### 2. **Version Banner**

When a new version is detected:

- A banner appears at the bottom of the screen: **"A new version of Abcotronics ERP is available."**
- Two buttons:
  - **"Reload now"** - Immediately reloads the page to get the latest version
  - **"Later"** - Dismisses the banner (but it will reappear if they navigate or switch tabs)

### 3. **Smart Dismissal**

- If a user dismisses the banner, it won't show again for that specific version
- However, if they navigate to a new page or switch tabs, it will check again
- This ensures users don't miss critical updates

## For Already Logged-In Users

### Scenario 1: User is actively using the app
- Version check happens every 60 seconds automatically
- If a new version is deployed, they'll see the banner within 60 seconds
- They can click "Reload now" to get the latest version immediately

### Scenario 2: User has been on the same page for a while
- Periodic polling continues in the background
- When they navigate to a new page, version is checked immediately
- When they switch browser tabs and come back, version is checked immediately

### Scenario 3: User dismissed the banner
- Banner won't show again for that specific version
- But if they navigate or switch tabs, it will check again
- This prevents users from permanently dismissing critical updates

## Technical Details

### Version Endpoint
- **URL**: `/version`
- **Response**: `{ "version": "1.0.0", "buildTime": "2025-01-15T10:30:00Z" }`
- **Cache**: No cache headers (always fresh)

### Storage
- **Version Storage**: `localStorage.getItem('abcotronics_app_version')`
- **Dismissed Version**: `localStorage.getItem('abcotronics_version_dismissed')`

### Manual Check (for debugging)
You can manually trigger a version check in the browser console:
```javascript
window.checkAppVersion()
```

## Deployment Workflow

1. **Deploy new version** to production
2. **Server updates** `/version` endpoint with new version number
3. **Logged-in users** are automatically notified within 60 seconds (or sooner if they navigate)
4. **Users click "Reload now"** to get the latest version
5. **New users** automatically get the latest version (no-cache headers ensure fresh HTML)

## Best Practices

### For Critical Updates
If you deploy a critical update that requires immediate reload:

1. **Update the version number** in `package.json` or `APP_VERSION` env var
2. **Deploy** the new version
3. **Monitor** - Users will be notified within 60 seconds
4. **Optional**: You can reduce the polling interval temporarily for critical updates

### For Non-Critical Updates
- The system works automatically
- Users can continue working and reload when convenient
- Banner appears but doesn't interrupt workflow

## Testing

To test the version update system:

1. **Deploy a new version** with a different version number
2. **Open the app** in a browser
3. **Wait up to 60 seconds** or navigate between pages
4. **Verify** the banner appears
5. **Click "Reload now"** to confirm it works

## Troubleshooting

### Banner not appearing?
- Check browser console for errors
- Verify `/version` endpoint returns valid JSON
- Check that version number actually changed
- Try manual check: `window.checkAppVersion()` in console

### Users not seeing updates?
- Ensure `index.html` has no-cache headers (already configured)
- Verify Nginx config is deployed (already done)
- Check that `/version` endpoint is accessible
- Verify version number is being updated on deployment

## Summary

✅ **All logged-in users** are automatically checked for new versions  
✅ **Multiple check triggers** ensure users don't miss updates  
✅ **Non-intrusive banner** that can be dismissed but reappears on navigation  
✅ **Immediate reload** option for users who want the latest version right away  
✅ **Smart dismissal** prevents banner spam while ensuring critical updates are seen


