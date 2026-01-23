# Simple Setup Guide (PostgreSQL with Password)

Your PostgreSQL installation requires a password. Here are the easiest ways to set up:

## Option 1: Use the Setup Script (Easiest)

Run this script - it will prompt you for your password:

```bash
cd "/Users/gemau/Documents/Project ERP/abcotronics-erp-modular"
bash scripts/setup-with-password.sh
```

Enter your PostgreSQL password when prompted. The script will:
- Create the database
- Create `.env.local` with your password
- Set up the database schema

## Option 2: Manual Setup

### Step 1: Create Database

You need to know your PostgreSQL password. Then run:

```bash
# Replace YOUR_PASSWORD with your actual password
PGPASSWORD=YOUR_PASSWORD createdb -U gemau abcotronics_erp_local
```

### Step 2: Create .env.local

Create `.env.local` file with your password:

```bash
cat > .env.local << 'EOF'
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:3000
DATABASE_URL="postgresql://gemau:YOUR_PASSWORD@localhost:5432/abcotronics_erp_local"
JWT_SECRET=0266f788ee2255e2aa973f0984903fb61f3fb1d9f528b315c9dbd0bf53fe5ea8
DEV_LOCAL_NO_DB=false
EOF
```

**Important:** Replace `YOUR_PASSWORD` with your actual PostgreSQL password.

### Step 3: Set Up Schema

```bash
export DATABASE_URL="postgresql://gemau:YOUR_PASSWORD@localhost:5432/abcotronics_erp_local"
npx prisma db push --accept-data-loss
```

### Step 4: Start Dev Server

```bash
npm run dev
```

## Option 3: Fix Authentication (No Password Required)

If you want to remove password requirements for local development:

1. Find PostgreSQL config:
   ```bash
   sudo find /Library/PostgreSQL/18 -name "pg_hba.conf"
   ```

2. Edit the file (requires sudo):
   ```bash
   sudo nano /Library/PostgreSQL/18/data/pg_hba.conf
   ```

3. Find the line that says:
   ```
   local   all   all   md5
   ```
   
   Change it to:
   ```
   local   all   all   trust
   ```

4. Restart PostgreSQL:
   ```bash
   sudo launchctl unload /Library/LaunchDaemons/com.edb.launchd.postgresql-18.plist
   sudo launchctl load /Library/LaunchDaemons/com.edb.launchd.postgresql-18.plist
   ```

5. Then you can create database without password:
   ```bash
   createdb abcotronics_erp_local
   ```

## Don't Know Your Password?

If you don't remember your PostgreSQL password:

1. **Reset it:**
   ```bash
   sudo -u postgres psql
   ```
   Then:
   ```sql
   ALTER USER gemau WITH PASSWORD 'newpassword';
   \q
   ```

2. **Or create a new user:**
   ```sql
   CREATE USER gemau WITH PASSWORD 'yourpassword' SUPERUSER;
   ```

## Quick Test

After setup, test the connection:

```bash
psql "postgresql://gemau:YOUR_PASSWORD@localhost:5432/abcotronics_erp_local" -c "SELECT 1;"
```

If this works, your setup is correct!





