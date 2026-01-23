# Fix PostgreSQL Authentication - Step by Step

## The Problem
PostgreSQL is requiring a password for local connections, but we don't know the password.

## The Solution
Edit the PostgreSQL config file to allow local connections without a password.

## Step-by-Step Instructions

### Step 1: Find the Config File
```bash
sudo find /Library -name pg_hba.conf 2>/dev/null
```

This should show: `/Library/PostgreSQL/18/data/pg_hba.conf`

### Step 2: Backup the Config File
```bash
sudo cp /Library/PostgreSQL/18/data/pg_hba.conf /Library/PostgreSQL/18/data/pg_hba.conf.backup
```

### Step 3: Edit the Config File
```bash
sudo nano /Library/PostgreSQL/18/data/pg_hba.conf
```

### Step 4: Add Trust Authentication
At the **very top** of the file (before any other `local` lines), add:

```
# Local connections - trust (for local development)
local   all   all   trust
```

The file should look like this at the top:
```
# Local connections - trust (for local development)
local   all   all   trust

# TYPE  DATABASE        USER            ADDRESS                 METHOD
# ... rest of file
```

### Step 5: Save and Exit
- Press `Ctrl + X`
- Press `Y` to confirm
- Press `Enter` to save

### Step 6: Restart PostgreSQL
```bash
sudo launchctl unload /Library/LaunchDaemons/com.edb.launchd.postgresql-18.plist
sudo launchctl load /Library/LaunchDaemons/com.edb.launchd.postgresql-18.plist
```

### Step 7: Test
```bash
createdb abcotronics_erp_local
```

If this works without asking for a password, you're done!

### Step 8: Continue Setup
```bash
# Set up schema
export DATABASE_URL="postgresql://gemau@localhost:5432/abcotronics_erp_local"
npx prisma db push --accept-data-loss

# Start dev server
npm run dev
```

## Alternative: Use a Different Editor

If `nano` doesn't work, try:
```bash
sudo vim /Library/PostgreSQL/18/data/pg_hba.conf
```

Or use a GUI editor:
```bash
sudo open -a TextEdit /Library/PostgreSQL/18/data/pg_hba.conf
```

## What This Does

- `local all all trust` means: for local socket connections, allow all users to connect to all databases without a password
- This is safe for local development on your own machine
- Production servers should still use password authentication





