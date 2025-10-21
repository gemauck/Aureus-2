# Railway Login Fix Guide

## Problem Summary
The Railway deployment is experiencing login issues with 500 Internal Server Error on the `/api/auth/login` endpoint. This is caused by:

1. **Database connection issues** - Prisma client not connecting properly
2. **Missing admin user** - No admin user exists in the database
3. **Environment variables** - JWT_SECRET and DATABASE_URL may not be configured
4. **Module loading errors** - "exports is not defined" errors in browser

## Solution

### Step 1: Deploy the Fix
Run the deployment script to fix the login issues:

```bash
./deploy-railway-login-fix.sh
```

This script will:
- Set up proper environment variables
- Deploy the updated code
- Create the admin user with correct credentials

### Step 2: Manual Fix (if script fails)

#### 2.1 Set Environment Variables
```bash
railway variables set JWT_SECRET="$(openssl rand -base64 32)"
railway variables set NODE_ENV="production"
railway variables set APP_URL="https://abco-erp-2-production.up.railway.app"
```

#### 2.2 Deploy Updated Code
```bash
railway up
```

#### 2.3 Create Admin User
```bash
railway run node fix-railway-login.js
```

### Step 3: Verify the Fix

#### 3.1 Check Health Endpoint
Visit: `https://abco-erp-2-production.up.railway.app/api/health`

You should see:
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

#### 3.2 Test Login
Use these credentials:
- **Email**: `admin@abcotronics.com`
- **Password**: `admin123`

### Step 4: Troubleshooting

#### If Database Connection Fails:
1. Check Railway PostgreSQL service is running
2. Verify DATABASE_URL is set correctly
3. Run: `railway run npx prisma db push`

#### If Admin User Missing:
1. Run: `railway run node fix-railway-login.js`
2. Check logs: `railway logs`

#### If JWT Errors:
1. Verify JWT_SECRET is set: `railway variables`
2. Regenerate JWT_SECRET if needed

#### If Module Loading Errors:
1. Clear browser cache
2. Check if all dependencies are installed
3. Verify build process completed successfully

## Files Modified

1. **`api/auth/login.js`** - Enhanced error handling and logging
2. **`api/health.js`** - Added database connection testing
3. **`fix-railway-login.js`** - Script to create admin user
4. **`deploy-railway-login-fix.sh`** - Automated deployment script

## Expected Results

After applying the fix:
- ✅ Health endpoint shows database connected
- ✅ Admin user exists in database
- ✅ Login works with admin@abcotronics.com / admin123
- ✅ No more 500 errors on auth endpoints
- ✅ JWT tokens generated successfully

## Support

If issues persist:
1. Check Railway logs: `railway logs`
2. Test health endpoint: `/api/health`
3. Verify environment variables: `railway variables`
4. Check database connection: `railway run npx prisma db push`
