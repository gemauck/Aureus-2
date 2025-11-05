# Local Development Setup Guide

## Problem
The remote DigitalOcean database is not accessible from localhost (firewall restrictions). You need a local PostgreSQL database for development.

## Quick Setup (Choose One)

### Option 1: Use the Setup Script (Recommended)

```bash
./setup-local-dev.sh
```

This script will:
- Check if PostgreSQL is running
- Ask for your PostgreSQL credentials
- Create the database
- Set up .env.local
- Run migrations

### Option 2: Manual Setup

1. **Make sure PostgreSQL is running:**
   ```bash
   # Check if running
   pg_isready -h localhost
   
   # If not running, start it:
   # macOS (Homebrew)
   brew services start postgresql@18
   
   # macOS (Postgres.app)
   # Just open Postgres.app
   ```

2. **Create the database:**
   ```bash
   # Replace 'yourpassword' with your PostgreSQL password
   PGPASSWORD=yourpassword psql -U postgres -h localhost -c "CREATE DATABASE abcotronics_erp;"
   ```

3. **Update .env file:**
   ```bash
   # Backup current .env
   cp .env .env.production.backup
   
   # Edit .env and change DATABASE_URL to:
   DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/abcotronics_erp"
   ```

4. **Run migrations:**
   ```bash
   npx prisma generate
   npx prisma migrate dev --name init
   # OR if migrations already exist:
   npx prisma db push
   ```

5. **Start the server:**
   ```bash
   npm run dev
   ```

### Option 3: Use Remote Database (If you have VPN/access)

If you have access to the remote database (VPN, IP whitelist, etc.), you can keep using the remote database:

1. Make sure your IP is whitelisted in DigitalOcean
2. Keep the current .env file
3. Test connection:
   ```bash
   npx prisma db pull
   ```

## Troubleshooting

### "password authentication failed"
- Make sure you're using the correct PostgreSQL password
- Try connecting with: `psql -U postgres -d postgres` to test

### "database does not exist"
- Create it manually: `createdb abcotronics_erp`
- Or use: `psql -U postgres -c "CREATE DATABASE abcotronics_erp;"`

### "Can't reach database server"
- Check if PostgreSQL is running: `pg_isready -h localhost`
- Check PostgreSQL logs for errors
- Verify the connection string in .env

## Next Steps After Setup

1. **Start the server:**
   ```bash
   npm run dev
   ```

2. **Open the app:**
   - http://localhost:3000

3. **Create an admin user** (if needed):
   - Check if there's a seed script: `npm run seed`
   - Or create via the app interface

