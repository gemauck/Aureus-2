# Local Development Guide

This guide will help you set up a complete local copy of your live environment so you can test changes before deploying to production.

## Quick Start

### 1. Initial Setup (One-time)

Run the setup script to create your local environment:

```bash
./setup-local-live-environment.sh
```

Or using npm:

```bash
npm run setup:local-live
```

This script will:
- ✅ Start a local PostgreSQL database using Docker
- ✅ Install all dependencies
- ✅ Set up the database schema
- ✅ Copy production data to your local database
- ✅ Configure `.env.local` for local development

**Note:** The first time you run this, it will copy all data from production. This may take a few minutes.

### 2. Launch Local Server

After setup, start your local development server:

```bash
./launch-local.sh
```

Or using npm:

```bash
npm run launch:local
```

Or use the standard dev command:

```bash
npm run dev
```

Your local application will be available at: **http://localhost:3000**

## Daily Workflow

### Starting Your Day

1. **Start the local database** (if not already running):
   ```bash
   docker-compose up -d
   ```

2. **Launch the development server**:
   ```bash
   npm run dev
   ```

### Making Changes

1. Make your changes in the code
2. Test them locally at `http://localhost:3000`
3. Once everything works, deploy to production

### Updating Production Data

To refresh your local database with the latest production data:

```bash
npm run copy:prod-data
```

Or:

```bash
./scripts/copy-production-data.sh
```

## Useful Commands

### Database Management

- **View database in browser**: `npm run db:studio` (opens Prisma Studio at http://localhost:5555)
- **Stop local database**: `docker-compose down`
- **Start local database**: `docker-compose up -d`
- **View database logs**: `docker-compose logs postgres`

### Development

- **Start dev server (real app)**: `npm run dev:backend` ⭐ **Recommended**
- **Start dev server (all)**: `npm run dev` (starts backend + frontend modernization project)
- **Watch JSX changes**: `npm run watch:jsx` (auto-builds components from `src/`)
- **Build for production**: `npm run build`

**Note:** For working on the real application, use `npm run dev:backend`. The `frontend/` directory is a separate modernization project and is NOT used by the live app.

### Production Deployment

- **Deploy to production**: `npm run deploy`

## Environment Files

- **`.env.local`** - Local development configuration (overrides `.env`)
- **`.env`** - Base environment configuration

The setup script automatically creates `.env.local` with:
- Local database connection
- Development mode settings
- Same JWT secret as production (for testing)

## Troubleshooting

### Database Not Starting

If the database container fails to start:

```bash
docker-compose down
docker-compose up -d
docker-compose logs postgres
```

### Can't Connect to Database

1. Check if Docker is running: `docker ps`
2. Check if database container is running: `docker ps | grep abcotronics_erp_local_db`
3. Restart the container: `docker-compose restart`

### Production Data Copy Fails

If copying production data fails:

1. **Check SSH access**: Make sure you can SSH to the production server
   ```bash
   ssh root@165.22.127.196
   ```

2. **Check database firewall**: Your IP must be whitelisted in Digital Ocean database firewall

3. **Manual copy**: You can manually dump and restore:
   ```bash
   # On production server
   ssh root@165.22.127.196 'cd /var/www/abcotronics-erp && pg_dump $DATABASE_URL > /tmp/dump.sql'
   
   # Copy to local
   scp root@165.22.127.196:/tmp/dump.sql /tmp/
   
   # Restore locally
   docker exec -i abcotronics_erp_local_db psql -U gemau -d abcotronics_erp_local < /tmp/dump.sql
   ```

### Port Already in Use

If port 3000 is already in use:

1. Change the port in `.env.local`:
   ```
   PORT=3001
   ```

2. Or stop the process using port 3000:
   ```bash
   lsof -ti:3000 | xargs kill -9
   ```

## Important Notes

⚠️ **Safety**: 
- Your local database is completely separate from production
- Changes made locally will **NOT** affect production
- Always test changes locally before deploying

🔒 **Security**:
- Never commit `.env.local` to git (it's already in `.gitignore`)
- The local database uses no password (trust authentication)
- Production database credentials are never stored locally

## Next Steps

After setting up your local environment:

1. ✅ Test that you can log in locally
2. ✅ Verify data was copied correctly
3. ✅ Make a test change and verify it works
4. ✅ Deploy your changes to production when ready

## Getting Help

If you encounter issues:

1. Check the error messages in the terminal
2. Check Docker logs: `docker-compose logs`
3. Check server logs in the terminal where `npm run dev` is running
4. Verify your `.env.local` file exists and has correct values

---

**Happy coding! 🚀**

