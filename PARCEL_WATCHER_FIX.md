# @parcel/watcher Railway Deployment Fix

## Problem
The Railway deployment was failing with the following error:
```
Error: No prebuild or local build of @parcel/watcher found. Tried @parcel/watcher-linux-x64-glibc.
```

## Root Cause
The `@tailwindcss/cli@4.1.15` package depends on `@parcel/watcher`, which is a native dependency that requires platform-specific binaries. Railway's build environment doesn't have the correct binary for the Linux platform.

## Solution
1. **Removed problematic dependency**: Switched from `@tailwindcss/cli@4.1.15` to `tailwindcss@3.4.0`
2. **Updated build script**: Changed from `tailwindcss` to `npx tailwindcss` in the build command
3. **Updated nixpacks.toml**: Added `--no-optional` flag to prevent installation of optional native dependencies
4. **Regenerated package-lock.json**: Removed old dependencies and installed clean versions

## Changes Made

### package.json
```json
{
  "scripts": {
    "build:css": "npx tailwindcss -i ./src/styles/main.css -o ./dist/styles.css --minify"
  },
  "devDependencies": {
    "tailwindcss": "^3.4.0"  // Changed from @tailwindcss/cli@4.1.15
  }
}
```

### nixpacks.toml
```toml
[phases.install]
cmds = [
  "npm ci --include=dev --no-optional",  // Added --no-optional flag
  "npx prisma generate --no-engine"
]
```

## Testing
- ✅ Local build test: `npm run railway-build` works successfully
- ✅ CSS generation: `dist/styles.css` is created with correct size
- ✅ No native dependencies: Build process uses only JavaScript-based tools

## Deployment
Use the provided script to deploy:
```bash
./deploy-parcel-watcher-fix.sh
```

Or deploy manually:
```bash
railway up
```

## Benefits
- No more native dependency issues
- Faster build times (no compilation of native binaries)
- More reliable deployments across different platforms
- Maintains all Tailwind CSS functionality

## Notes
- Tailwind CSS v3.4.0 is stable and widely used
- All existing Tailwind configurations remain compatible
- No changes needed to existing CSS classes or styles
