# Railway Login Fix - Manual Steps

## Quick Fix Instructions

Since the Railway CLI requires interactive login, here are the manual steps to fix your login issue:

### Step 1: Login to Railway CLI
```bash
railway login
```

### Step 2: Set Environment Variables
```bash
railway variables set JWT_SECRET="$(openssl rand -base64 32)"
railway variables set NODE_ENV="production"
railway variables set APP_URL="https://abco-erp-2-production.up.railway.app"
```

### Step 3: Deploy the Fix
```bash
railway up
```

### Step 4: Create Admin User
```bash
railway run node fix-railway-login.js
```

### Step 5: Test the Fix
1. Visit: `https://abco-erp-2-production.up.railway.app/api/health`
2. Should show database connected and admin user exists
3. Try logging in with:
   - Email: `admin@abcotronics.com`
   - Password: `admin123`

## Alternative: Railway Dashboard Method

If CLI doesn't work, use the Railway dashboard:

1. Go to your Railway project dashboard
2. Navigate to Variables tab
3. Add these variables:
   - `JWT_SECRET`: Generate a random 32-character string
   - `NODE_ENV`: `production`
   - `APP_URL`: `https://abco-erp-2-production.up.railway.app`
4. Redeploy your service
5. Use Railway's console to run: `node fix-railway-login.js`

## What Was Fixed

1. **Enhanced login endpoint** with better error handling
2. **Database connection testing** in health check
3. **Admin user creation script** to ensure user exists
4. **Improved error logging** for debugging

## Expected Results

After applying the fix:
- ✅ No more 500 errors on login
- ✅ Admin user exists in database
- ✅ Login works with provided credentials
- ✅ Health endpoint shows all systems OK

## Troubleshooting

If you still have issues:
1. Check Railway logs in the dashboard
2. Verify environment variables are set
3. Ensure PostgreSQL service is running
4. Test the health endpoint first

The main issue was likely missing environment variables (JWT_SECRET) and/or missing admin user in the database.
