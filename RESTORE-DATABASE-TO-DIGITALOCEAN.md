# Restore Database to DigitalOcean

This guide will help you restore your PostgreSQL database backup to the DigitalOcean managed database server.

## Database Connection Details

```
Host: dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com
Port: 25060
Database: defaultdb
Username: doadmin
Password: <DIGITALOCEAN_DB_PASSWORD>
SSL Mode: require
```

## Prerequisites

1. **PostgreSQL Client Tools** - You need `pg_restore` and `psql` installed
   - **macOS**: `brew install postgresql`
   - **Linux (Ubuntu/Debian)**: `sudo apt-get install postgresql-client`
   - **Linux (RHEL/CentOS)**: `sudo yum install postgresql`

2. **Backup File**: `backups/abcotronics-prod-202511111522.dump`

3. **Network Access**: Ensure your IP is allowed in DigitalOcean database firewall rules

## Step-by-Step Restore Process

### Step 1: Test Connection (Recommended)

Before restoring, test that you can connect to the database:

```bash
./test-digitalocean-connection.sh
```

This will verify:
- ✅ Network connectivity
- ✅ Credentials are correct
- ✅ SSL connection works
- ✅ Database is accessible

### Step 2: Restore the Database

**⚠️ WARNING**: This will **OVERWRITE** all existing data in the target database!

```bash
TARGET_DATABASE_URL="postgresql://doadmin:<DIGITALOCEAN_DB_PASSWORD>@dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com:25060/defaultdb?sslmode=require" \
./restore-to-digitalocean.sh
```

The script will:
1. Check if the backup file exists
2. Verify PostgreSQL tools are installed
3. Ask for confirmation before proceeding
4. Restore the database using `pg_restore`
5. Verify the restore completed successfully

**Expected Duration**: 
- Small databases (< 1GB): 5-15 minutes
- Medium databases (1-10GB): 15-60 minutes
- Large databases (> 10GB): 1+ hours

### Step 3: Update Application Configuration

After the restore is complete, update your production application to use the new database:

```bash
./update-app-to-digitalocean-db.sh
```

This script will:
1. Connect to your production server (165.22.127.196)
2. Backup existing `.env` file
3. Update `DATABASE_URL` in `.env` and PM2 config
4. Regenerate Prisma client
5. Restart the application

### Step 4: Verify the Restore

1. **Check Application Health**:
   ```bash
   curl https://abcoafrica.co.za/api/health
   ```

2. **Check Server Logs**:
   ```bash
   ssh root@165.22.127.196 'cd /var/www/abcotronics-erp && pm2 logs abcotronics-erp'
   ```

3. **Test Application**:
   - Visit: https://abcoafrica.co.za
   - Log in and verify data is present
   - Check key features are working

## Manual Restore (Alternative)

If you prefer to run the restore manually:

```bash
# Set password as environment variable (copy it from DigitalOcean portal)
export PGPASSWORD="<DIGITALOCEAN_DB_PASSWORD>"

# Restore the database
pg_restore \
  -v \
  -h dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com \
  -p 25060 \
  -U doadmin \
  -d defaultdb \
  --no-owner \
  --no-privileges \
  --if-exists \
  -c \
  backups/abcotronics-prod-202511111522.dump

# Unset password
unset PGPASSWORD
```

## Troubleshooting

### Connection Issues

**Error: "could not connect to server"**
- Check your IP is whitelisted in DigitalOcean database firewall
- Verify network connectivity: `ping <hostname>`
- Check if port 25060 is accessible

**Error: "password authentication failed"**
- Double-check the password is correct
- Ensure username is `doadmin` (not `postgres`)

**Error: "SSL connection required"**
- The connection string should include `?sslmode=require`
- Verify SSL certificates are valid

### Restore Issues

**Error: "relation already exists"**
- The restore script uses `-c` flag to clean existing objects
- If issues persist, you may need to drop and recreate the database

**Error: "permission denied"**
- The script uses `--no-owner` and `--no-privileges` flags
- If issues persist, check database user permissions

**Restore is very slow**
- Large databases take time to restore
- Check network speed and database server resources
- Monitor progress with `-v` (verbose) flag

### Application Issues After Restore

**Error: "Prisma schema mismatch"**
- Run: `npx prisma migrate deploy`
- Or: `npx prisma db push`

**Error: "Connection refused"**
- Verify `DATABASE_URL` is updated in `.env`
- Check PM2 process is restarted
- Verify database server is accessible from application server

## Connection String Format

For reference, the full connection string is:

```
postgresql://doadmin:<DIGITALOCEAN_DB_PASSWORD>@dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com:25060/defaultdb?sslmode=require
```

> ℹ️ Retrieve `<DIGITALOCEAN_DB_PASSWORD>` from the DigitalOcean control panel. Never commit the real password to the repository.

## Files Created

- `restore-to-digitalocean.sh` - Main restore script
- `test-digitalocean-connection.sh` - Connection test script
- `update-app-to-digitalocean-db.sh` - Application config update script
- `RESTORE-DATABASE-TO-DIGITALOCEAN.md` - This guide

## Support

If you encounter issues:
1. Check the error messages carefully
2. Review DigitalOcean database logs
3. Verify network connectivity
4. Test connection separately before full restore

