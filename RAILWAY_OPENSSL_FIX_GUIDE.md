# Railway OpenSSL Fix Guide

## Problem Identified
The Railway deployment is failing with Prisma OpenSSL compatibility issues:

```
Error loading shared library libssl.so.1.1: No such file or directory (needed by /app/node_modules/.prisma/client/libquery_engine-linux-musl.so.node)
```

This is a common issue with Prisma on Railway due to OpenSSL version mismatches.

## Root Cause
- Railway uses Alpine Linux with musl libc
- Prisma binary targets don't match Railway's OpenSSL version
- Missing OpenSSL 1.1.x compatibility

## Solution Applied

### 1. Updated Prisma Schema
Modified `prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
  engineType = "binary"
  binaryTargets = ["native", "linux-musl-openssl-3.0.x", "linux-musl-openssl-1.1.x"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### 2. Updated Nixpacks Configuration
Modified `nixpacks.toml`:
```toml
[phases.setup]
nixPkgs = ["nodejs", "openssl", "openssl.dev", "openssl_1_1"]
```

### 3. Created Deployment Script
`deploy-railway-openssl-fix.sh` handles:
- Prisma client regeneration
- Environment variable setup
- Database migration
- Admin user creation

## Manual Fix Steps

### Step 1: Login to Railway
```bash
railway login
```

### Step 2: Regenerate Prisma Client
```bash
npx prisma generate
```

### Step 3: Set Environment Variables
```bash
railway variables set JWT_SECRET="$(openssl rand -base64 32)"
railway variables set NODE_ENV="production"
railway variables set APP_URL="https://abco-erp-2-production.up.railway.app"
```

### Step 4: Deploy
```bash
railway up
```

### Step 5: Run Database Migration
```bash
railway run npx prisma db push
```

### Step 6: Create Admin User
```bash
railway run node fix-railway-login.js
```

## Alternative: Railway Dashboard Method

1. Go to Railway project dashboard
2. Navigate to Variables tab
3. Add these variables:
   - `JWT_SECRET`: Generate a random 32-character string
   - `NODE_ENV`: `production`
   - `APP_URL`: `https://abco-erp-2-production.up.railway.app`
4. Redeploy your service
5. Use Railway's console to run:
   - `npx prisma db push`
   - `node fix-railway-login.js`

## Verification Steps

### 1. Check Health Endpoint
Visit: `https://abco-erp-2-production.up.railway.app/api/health`

Expected response:
```json
{
  "status": "ok",
  "checks": {
    "database": "connected",
    "jwt_secret": true,
    "admin_user": "exists"
  }
}
```

### 2. Test Login
- Email: `admin@abcotronics.com`
- Password: `admin123`

## Files Modified

1. **`prisma/schema.prisma`** - Added OpenSSL 1.1.x binary target
2. **`nixpacks.toml`** - Added OpenSSL 1.1.x package
3. **`deploy-railway-openssl-fix.sh`** - Automated deployment script
4. **`api/auth/login.js`** - Enhanced error handling
5. **`api/health.js`** - Database connection testing

## Expected Results

After applying the fix:
- ✅ No more Prisma OpenSSL errors
- ✅ Database connection successful
- ✅ Login endpoint works (no 500 errors)
- ✅ Admin user exists and can authenticate
- ✅ Health endpoint shows all systems OK

## Troubleshooting

### If Prisma still fails:
1. Check Railway logs for specific error messages
2. Verify OpenSSL packages are installed
3. Try regenerating Prisma client: `npx prisma generate`

### If database connection fails:
1. Verify DATABASE_URL is set correctly
2. Check PostgreSQL service is running
3. Run: `railway run npx prisma db push`

### If login still fails:
1. Check JWT_SECRET is set
2. Verify admin user exists: `railway run node fix-railway-login.js`
3. Check Railway logs for detailed error messages

The main issue was Prisma's binary targets not matching Railway's OpenSSL version. This fix ensures compatibility.
