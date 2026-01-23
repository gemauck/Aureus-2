# Local Development Environment Setup

This guide will help you set up a local development environment that mirrors your production setup, allowing you to test changes locally before deploying.

## Prerequisites

1. **PostgreSQL** installed locally
   - macOS: `brew install postgresql@14` or `brew install postgresql`
   - Ubuntu: `sudo apt-get install postgresql postgresql-contrib`
   - Windows: Download from [PostgreSQL website](https://www.postgresql.org/download/)

2. **Node.js** (v18 or higher)
3. **SSH access** to production server (for copying production data)

## Quick Start

Run the complete setup script:

```bash
npm run setup:local-dev
```

This will:
1. Set up a local PostgreSQL database
2. Copy production data to your local database
3. Install dependencies and build the application
4. Configure environment variables

## Manual Setup

If you prefer to set up step by step:

### Step 1: Set up Local Database

```bash
bash scripts/setup-local-dev.sh
```

This script will:
- Check if PostgreSQL is installed and running
- Create a local database named `abcotronics_erp_local`
- Create `.env.local` with local development settings
- Run Prisma migrations to set up the schema

### Step 2: Copy Production Data (Optional)

To get a copy of your production data:

```bash
npm run copy:prod-data
# or
bash scripts/copy-production-data.sh
```

This will:
- Connect to your production server
- Dump the production database
- Restore it to your local database

**Note:** You'll need SSH access to the production server. If direct connection fails, the script will provide manual instructions.

### Step 3: Start Development Server

```bash
npm run dev
```

This starts:
- Frontend development server (Vite)
- Backend server
- JSX watcher

Open your browser to: **http://localhost:3000**

## Environment Files

- **`.env.local`** - Local development settings (created automatically)
- **`.env`** - Production settings (not used in local dev)

The `.env.local` file contains:
- Local PostgreSQL connection string
- Development mode settings
- JWT secret (same as production for testing)

## Useful Commands

```bash
# View database in browser
npm run db:studio
# Opens Prisma Studio at http://localhost:5555

# Copy production data again (to refresh local data)
npm run copy:prod-data

# Reset local database
bash scripts/setup-local-dev.sh

# Run migrations manually
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate
```

## Database Management

### Viewing Your Database

Use Prisma Studio to view and edit your local database:

```bash
npm run db:studio
```

### Resetting Your Database

If you need to start fresh:

```bash
# Drop and recreate database
bash scripts/setup-local-dev.sh
# (Answer 'y' when asked to drop existing database)

# Then copy production data again
npm run copy:prod-data
```

## Troubleshooting

### PostgreSQL Not Running

**macOS:**
```bash
brew services start postgresql@14
# or
brew services start postgresql
```

**Linux:**
```bash
sudo systemctl start postgresql
```

### Cannot Connect to Production Database

If the script can't dump the production database:

1. **Check SSH access:**
   ```bash
   ssh root@165.22.127.196
   ```

2. **Check database firewall:**
   - Your IP must be whitelisted in Digital Ocean database firewall
   - Go to: Digital Ocean → Databases → Your DB → Settings → Trusted Sources

3. **Manual dump:**
   ```bash
   # On production server
   ssh root@165.22.127.196
   cd /var/www/abcotronics-erp
   pg_dump $DATABASE_URL > /tmp/dump.sql
   
   # On local machine
   scp root@165.22.127.196:/tmp/dump.sql /tmp/dump.sql
   psql postgresql://youruser@localhost:5432/abcotronics_erp_local < /tmp/dump.sql
   ```

### Port Already in Use

If port 3000 is already in use:

1. Change port in `.env.local`:
   ```
   PORT=3001
   ```

2. Or kill the process using port 3000:
   ```bash
   lsof -ti:3000 | xargs kill -9
   ```

### Database Connection Errors

If you see database connection errors:

1. Check PostgreSQL is running:
   ```bash
   pg_isready
   ```

2. Check database exists:
   ```bash
   psql -l | grep abcotronics_erp_local
   ```

3. Test connection:
   ```bash
   psql postgresql://youruser@localhost:5432/abcotronics_erp_local
   ```

## Workflow

1. **Make changes locally** - Edit code, test features
2. **Test thoroughly** - Ensure everything works
3. **Deploy to production** - When ready, deploy using your normal process

## Important Notes

- **Local database is separate from production** - Changes won't affect production
- **Production data is copied, not synced** - To get latest data, run `npm run copy:prod-data` again
- **`.env.local` is for local development only** - Never commit this file
- **Always test locally before deploying** - This prevents breaking production

## Next Steps

After setup:
1. Start the dev server: `npm run dev`
2. Open http://localhost:3000
3. Log in with your production credentials (if you copied production data)
4. Start developing!
