# Quick Fix for PostgreSQL Password Issue

## The Problem
PostgreSQL is asking for a password when you try to create the database, but authentication is failing.

## Solution Options

### Option 1: Use postgres superuser (Easiest)

```bash
# Connect as postgres user (might not need password)
psql -U postgres

# Or if that doesn't work:
sudo -u postgres psql
```

Then inside psql:
```sql
CREATE DATABASE abcotronics_erp_local;
CREATE USER gemau WITH SUPERUSER;
\q
```

### Option 2: Fix authentication (Recommended for development)

Run the fix script:
```bash
bash scripts/fix-postgres-auth.sh
```

This will:
- Configure PostgreSQL to allow local connections without password
- Restart PostgreSQL
- Then you can run: `createdb abcotronics_erp_local`

### Option 3: Manual fix

1. Find your PostgreSQL config file:
   ```bash
   # On macOS with Homebrew:
   find ~/Library/Application\ Support/Postgres -name "pg_hba.conf" 2>/dev/null
   # Or:
   find /opt/homebrew/var -name "pg_hba.conf" 2>/dev/null
   ```

2. Edit the file and add this line at the TOP:
   ```
   local   all   all   trust
   ```

3. Restart PostgreSQL:
   ```bash
   brew services restart postgresql
   ```

4. Try again:
   ```bash
   createdb abcotronics_erp_local
   ```

### Option 4: Use a password

If you know your PostgreSQL password:
```bash
PGPASSWORD=yourpassword createdb -U gemau abcotronics_erp_local
```

Or set it in the connection string in `.env.local`:
```
DATABASE_URL="postgresql://gemau:yourpassword@localhost:5432/abcotronics_erp_local"
```

## After Database is Created

1. Set up schema:
   ```bash
   export DATABASE_URL="postgresql://gemau@localhost:5432/abcotronics_erp_local"
   npx prisma db push --accept-data-loss
   ```

2. Start dev server:
   ```bash
   npm run dev
   ```

## Check PostgreSQL Status

```bash
# Check if running
pg_isready

# Check version
psql --version

# List databases
psql -l
```
