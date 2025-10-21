# Railway Production Deployment Guide

## Current Status
✅ **Local Development**: Working with SQLite database
❌ **Production**: 500 Internal Server Error - Database configuration issue

## Quick Fix Steps

### 1. Login to Railway
```bash
railway login
```

### 2. Deploy Current Working Version
```bash
railway up
```

### 3. Set Up Database
```bash
railway run npx prisma db push
```

### 4. Create Admin User
```bash
railway run node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

async function createAdmin() {
  const prisma = new PrismaClient();
  try {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const admin = await prisma.user.upsert({
      where: { email: 'admin@abcotronics.com' },
      update: { passwordHash: hashedPassword },
      create: {
        email: 'admin@abcotronics.com',
        name: 'Admin User',
        passwordHash: hashedPassword,
        role: 'admin',
        provider: 'local'
      }
    });
    console.log('✅ Admin user created:', admin.email);
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.\$disconnect();
  }
}

createAdmin();
"
```

### 5. Test Login
- URL: https://abco-erp-2-production.up.railway.app
- Email: admin@abcotronics.com
- Password: admin123

## Environment Variables Needed

### Required
- `DATABASE_URL`: Set by Railway PostgreSQL service
- `JWT_SECRET`: Secure random string
- `NODE_ENV`: production
- `PORT`: 3000

### Optional
- `SMTP_HOST`: Email server
- `SMTP_PORT`: Email port
- `SMTP_USER`: Email username
- `SMTP_PASS`: Email password
- `GOOGLE_CLIENT_ID`: Google OAuth
- `GOOGLE_CLIENT_SECRET`: Google OAuth

## Database Options

### Option 1: SQLite (Current - Quick Fix)
- ✅ Fast setup
- ✅ No external dependencies
- ❌ Not suitable for production scaling
- ❌ No concurrent access

### Option 2: PostgreSQL (Recommended for Production)
- ✅ Production-ready
- ✅ Concurrent access
- ✅ Scalable
- ❌ Requires setup

## Migration to PostgreSQL

1. Add PostgreSQL service in Railway dashboard
2. Update schema to use PostgreSQL
3. Run migrations
4. Update environment variables

## Troubleshooting

### 500 Internal Server Error
- Check Railway logs: `railway logs`
- Verify database connection
- Check environment variables

### Login Issues
- Verify admin user exists
- Check JWT_SECRET is set
- Verify password hashing

### Database Connection Issues
- Check DATABASE_URL format
- Verify database service is running
- Check Prisma client generation

## Commands Reference

```bash
# Deploy
railway up

# View logs
railway logs

# Run commands
railway run <command>

# Open dashboard
railway open

# Scale service
railway scale

# Environment variables
railway variables
```
