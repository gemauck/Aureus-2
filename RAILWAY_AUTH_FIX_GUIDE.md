# Railway Authentication Fix Guide

## Problem Summary
The Abcotronics ERP application deployed on Railway is experiencing 401 Unauthorized errors when trying to login with `admin@abcotronics.com`. The logs show repeated authentication failures.

## Root Cause Analysis
1. **Database Connection Issue**: The Railway deployment may not have the `DATABASE_URL` environment variable properly configured
2. **Missing Admin User**: The admin user (`admin@abcotronics.com`) may not exist in the database
3. **JWT Secret Mismatch**: The JWT secret may not be properly configured

## Solutions

### Option 1: Fix Railway Environment Variables (Recommended)

1. **Check current environment variables:**
   ```bash
   railway variables
   ```

2. **Set the required environment variables:**
   ```bash
   # Set database URL (get this from Railway dashboard)
   railway variables set DATABASE_URL="postgresql://username:password@host:port/database"
   
   # Set JWT secret
   railway variables set JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
   ```

3. **Create admin user:**
   ```bash
   railway run node create-admin-railway.js
   ```

4. **Redeploy the application:**
   ```bash
   railway up
   ```

### Option 2: Use the Diagnostic Tool

1. Open `railway-auth-fix.html` in your browser
2. Follow the step-by-step diagnostic process
3. Use the automated tests to identify the specific issue

### Option 3: Manual Database Setup

If you have direct database access:

1. **Connect to your Railway PostgreSQL database**
2. **Create the admin user:**
   ```sql
   INSERT INTO "User" (id, email, name, "passwordHash", role, status, "createdAt", "updatedAt") 
   VALUES (
     'admin-1', 
     'admin@abcotronics.com', 
     'Admin User', 
     '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- password: admin123
     'ADMIN', 
     'active',
     NOW(), 
     NOW()
   );
   ```

### Option 4: Local Development Setup

For local development:

1. **Set up local PostgreSQL database**
2. **Update .env file:**
   ```
   DATABASE_URL="postgresql://username:password@localhost:5432/abcotronics_erp"
   JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
   ```

3. **Run migrations and seed:**
   ```bash
   npm run prisma:migrate
   npm run seed
   ```

4. **Start local server:**
   ```bash
   npm run dev
   ```

## Testing the Fix

After implementing any of the above solutions:

1. **Test login with:**
   - Email: `admin@abcotronics.com`
   - Password: `admin123`

2. **Verify the application loads without 401 errors**

3. **Check that you can access the dashboard and other features**

## Troubleshooting

### If you still get 401 errors:

1. **Check Railway logs:**
   ```bash
   railway logs
   ```

2. **Verify environment variables are set:**
   ```bash
   railway variables
   ```

3. **Test database connection:**
   ```bash
   railway run node -e "console.log(process.env.DATABASE_URL)"
   ```

4. **Check if admin user exists:**
   ```bash
   railway run node -e "
   import { PrismaClient } from '@prisma/client';
   const prisma = new PrismaClient();
   prisma.user.findUnique({ where: { email: 'admin@abcotronics.com' } })
     .then(user => console.log('Admin user:', user))
     .catch(err => console.error('Error:', err))
     .finally(() => prisma.\$disconnect());
   "
   ```

## Files Created

- `railway-auth-fix.html` - Diagnostic tool for testing Railway deployment
- `create-admin-railway.js` - Script to create admin user on Railway
- `fix-auth.sh` - Local development setup script

## Next Steps

1. Choose one of the solutions above
2. Implement the fix
3. Test the authentication
4. Verify the application is working properly

If you continue to experience issues, check the Railway logs for more specific error messages.
