# How to Clear Browser Cache and Force Fresh Load

## Quick Methods (Try in Order)

### Method 1: Hard Refresh (Fastest)
- **Mac**: Press `Cmd + Shift + R`
- **Windows/Linux**: Press `Ctrl + Shift + R`
- **Chrome DevTools**: Right-click refresh button → "Empty Cache and Hard Reload"

### Method 2: Clear Cache via Settings
1. **Chrome/Edge**:
   - Press `Cmd + Shift + Delete` (Mac) or `Ctrl + Shift + Delete` (Windows)
   - Select "Cached images and files"
   - Time range: "All time"
   - Click "Clear data"

2. **Firefox**:
   - Press `Cmd + Shift + Delete` (Mac) or `Ctrl + Shift + Delete` (Windows)
   - Select "Cache"
   - Time range: "Everything"
   - Click "Clear Now"

3. **Safari**:
   - Safari menu → Preferences → Advanced → Check "Show Develop menu"
   - Develop menu → "Empty Caches"
   - Or: `Cmd + Option + E`

### Method 3: Incognito/Private Window
- **Chrome**: `Cmd + Shift + N` (Mac) or `Ctrl + Shift + N` (Windows)
- **Firefox**: `Cmd + Shift + P` (Mac) or `Ctrl + Shift + P` (Windows)
- **Safari**: `Cmd + Shift + N` (Mac)
- Navigate to: `https://abcoafrica.co.za/projects/cmhn2drtq001lqyu9bgfzzqx6`

### Method 4: Clear via DevTools
1. Open DevTools (`F12` or `Cmd + Option + I`)
2. Right-click the refresh button
3. Select "Empty Cache and Hard Reload"

### Method 5: Manual Cache Clear (Most Thorough)
1. Open DevTools (`F12`)
2. Go to **Application** tab (Chrome) or **Storage** tab (Firefox)
3. Click **Clear storage** or **Clear site data**
4. Check all boxes
5. Click **Clear site data**
6. Refresh the page

### Method 6: Disable Cache (For Testing)
1. Open DevTools (`F12`)
2. Go to **Network** tab
3. Check **"Disable cache"** checkbox
4. Keep DevTools open while testing
5. Refresh the page

## Verify New Version Loaded

After clearing cache, check the browser console for:
- ✅ Should see: `✅ Vite module: WeeklyFMSReviewTracker exposed to window (overriding any existing version)`
- ❌ Should NOT see: `✅ Vite module: WeeklyFMSReviewTracker already available from main source, skipping`

## Expected Status Options

After cache clear, the status dropdown should show:
- **Not Checked** (grey) - default
- **Acceptable** (green)
- **Issue** (red)

Instead of the old:
- Not Collected
- Collection Ongoing
- Collected
- Unavailable









