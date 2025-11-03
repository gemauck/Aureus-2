# Production Login Fix - Create Users

## Problem
Production database is empty (fresh PostgreSQL database) causing "Invalid credentials" errors when trying to log in.

**Error logs show:**
- User trying to login: `garethm@abcotronics.co.za`
- Server responding: `401 Unauthorized` - "Invalid credentials"
- Cause: Empty database after migrating from SQLite to PostgreSQL

## Solution
Need to create user accounts in the production database.

## Quick Fix - Run User Creation Script

### Option 1: SSH and Run Script (Recommended)

```bash
# SSH into production server
ssh root@165.22.127.196

# Navigate to project directory
cd /var/www/abcotronics-erp

# Run the create-admin script
node scripts/create-admin.js
```

This will create:
- **garethm@abcotronics.co.za** (password: admin123) - Primary admin
- **admin@example.com** (password: admin123) - Generic admin

### Option 2: Run Seed Script (Creates Full Test Data)

```bash
# SSH into production server
ssh root@165.22.127.196

# Navigate to project directory
cd /var/www/abcotronics-erp

# Run the seed script (creates admin + test data)
npm run seed
```

This creates:
- **admin@example.com** (password: password123) - Admin user
- Acme Corp test client with sample data

### Option 3: One-Line Command

```bash
ssh root@165.22.127.196 'cd /var/www/abcotronics-erp && node scripts/create-admin.js'
```

## Testing After Creating Users

1. Visit: **https://abcoafrica.co.za**
2. Try logging in with one of the created accounts
3. Verify authentication works

## Credentials Summary

After running `scripts/create-admin.js`:
- **garethm@abcotronics.co.za** / admin123
- **admin@example.com** / admin123

After running `npm run seed`:
- **admin@example.com** / password123

## Important Notes

- Only need to run once to populate the database
- Scripts are idempotent (safe to run multiple times)
- Passwords should be changed after first login
- For production, consider using stronger passwords

