# Quick Local Development Setup

## What's Happening

The automated scripts are getting stuck on PostgreSQL password prompts. Here's how to set up your local environment manually:

## Step 1: Create the Database

Open a terminal and run ONE of these commands (try them in order):

```bash
# Option 1: Try without password (most common on macOS)
createdb abcotronics_erp_local

# Option 2: If that asks for a password, try connecting first
psql postgres
# Then inside psql, run:
CREATE DATABASE abcotronics_erp_local;
\q

# Option 3: If you have a PostgreSQL password set
PGPASSWORD=yourpassword createdb abcotronics_erp_local
```

## Step 2: Verify Database Created

```bash
psql -l | grep abcotronics_erp_local
```

You should see the database listed.

## Step 3: Set Up Database Schema

```bash
cd "/Users/gemau/Documents/Project ERP/abcotronics-erp-modular"
export DATABASE_URL="postgresql://gemau@localhost:5432/abcotronics_erp_local"
npx prisma db push --accept-data-loss
```

## Step 4: (Optional) Copy Production Data

If you want production data locally:

```bash
npm run copy:prod-data
```

Or manually:
1. Get production DATABASE_URL from server
2. Run: `pg_dump "production_url" > dump.sql`
3. Run: `psql "postgresql://gemau@localhost:5432/abcotronics_erp_local" < dump.sql`

## Step 5: Start Development Server

```bash
npm run dev
```

Then open: http://localhost:3000

## Troubleshooting

### "Database doesn't exist" error
- Make sure you created the database in Step 1
- Check: `psql -l | grep abcotronics_erp_local`

### "Password required" error
- Your PostgreSQL might require a password
- Try: `psql postgres` and enter your password
- Or set password in connection: `postgresql://user:password@localhost:5432/dbname`

### "Connection refused" error
- Make sure PostgreSQL is running: `pg_isready`
- Start it: `brew services start postgresql` (macOS)

## What's Already Done

✅ `.env.local` file created with local database settings
✅ Server.js updated to allow local databases in development mode
✅ All setup scripts created and ready to use

## Next Steps After Setup

1. **Test locally**: Make changes, test them
2. **When ready**: Deploy to production using your normal process
3. **Refresh data**: Run `npm run copy:prod-data` to get latest production data





