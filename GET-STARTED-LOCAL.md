# 🚀 Get Localhost Running - Quick Guide

## Problem Fixed
The remote DigitalOcean database is not accessible from localhost. The server now supports `.env.local` for local development.

## Quick Start (3 Steps)

### Step 1: Create Local Database

You need to create a PostgreSQL database. Choose one:

**Option A: Using the setup script (easiest)**
```bash
./setup-local-dev.sh
```
This will ask for your PostgreSQL credentials and set everything up.

**Option B: Manual setup**
```bash
# 1. Create the database (replace 'yourpassword' with your PostgreSQL password)
PGPASSWORD=yourpassword psql -U postgres -h localhost -c "CREATE DATABASE abcotronics_erp;"

# 2. Create .env.local file
cp .env.local.template .env.local

# 3. Edit .env.local and update DATABASE_URL:
# DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/abcotronics_erp"
```

### Step 2: Run Migrations

```bash
npx prisma generate
npx prisma db push
# OR if you have migrations:
npx prisma migrate dev --name init
```

### Step 3: Start the Server

```bash
npm run dev
```

Or use the quick start script:
```bash
./quick-start-local.sh
```

## ✅ What's Been Set Up

1. ✅ Server now loads `.env.local` if it exists (overrides `.env`)
2. ✅ Created setup script: `setup-local-dev.sh`
3. ✅ Created quick start script: `quick-start-local.sh`
4. ✅ Created template: `.env.local.template`
5. ✅ Created guide: `LOCAL-DEV-SETUP.md`

## 📝 Files Created

- `.env.local` - Your local database configuration (create this)
- `.env.local.template` - Template for local config
- `setup-local-dev.sh` - Interactive setup script
- `quick-start-local.sh` - Quick start script
- `LOCAL-DEV-SETUP.md` - Detailed setup guide

## 🔍 Troubleshooting

### "password authentication failed"
- Make sure you're using the correct PostgreSQL password
- Try: `psql -U postgres -d postgres` to test connection

### "database does not exist"
```bash
# Create it manually
PGPASSWORD=yourpassword psql -U postgres -h localhost -c "CREATE DATABASE abcotronics_erp;"
```

### "Can't reach database server"
```bash
# Check if PostgreSQL is running
pg_isready -h localhost

# If not running, start it:
# macOS (Homebrew): brew services start postgresql@18
# macOS (Postgres.app): Open Postgres.app
```

## 🎯 Next Steps After Setup

1. Open http://localhost:3000
2. Create an admin user (if database is empty)
3. Start developing!

