# Restored Database Setup - November 3 Backup

## Database Connection Details

Your restored database from the November 3 backup:

```
Host: dbaas-db-6934625-nov-3-backup-do-user-28031752-0.e.db.ondigitalocean.com
Port: 25060
Database: defaultdb
Username: doadmin
Password: [REDACTED - Use production credentials]
SSL Mode: require
```

## Connection String

```
postgresql://doadmin:[REDACTED]@dbaas-db-6934625-nov-3-backup-do-user-28031752-0.e.db.ondigitalocean.com:25060/defaultdb?sslmode=require
```

## Update Production Server

### Option 1: Automated Script (Recommended)

Run the update script from your local machine:

```bash
chmod +x update-restored-database.sh
./update-restored-database.sh
```

This will:
- Backup existing `.env` and `ecosystem.config.cjs`
- Update `DATABASE_URL` in both files
- Test the connection
- Restart the application

### Option 2: Manual Update via SSH

SSH into your production server:

```bash
ssh root@165.22.127.196
cd /var/www/abcotronics-erp
```

#### Update .env file:

```bash
# Backup existing .env
cp .env .env.backup

# Edit .env and update DATABASE_URL
nano .env
# Or use sed:
sed -i 's|DATABASE_URL=.*|DATABASE_URL="postgresql://doadmin:[REDACTED]@dbaas-db-6934625-nov-3-backup-do-user-28031752-0.e.db.ondigitalocean.com:25060/defaultdb?sslmode=require"|' .env
```

#### Update PM2 Config (if exists):

```bash
# Backup ecosystem.config.cjs
cp ecosystem.config.cjs ecosystem.config.cjs.backup

# Edit ecosystem.config.cjs
nano ecosystem.config.cjs
# Update the DATABASE_URL in the env section
```

#### Restart Application:

```bash
# Restart PM2
pm2 restart abcotronics-erp

# Or if using ecosystem config:
pm2 delete abcotronics-erp
pm2 start ecosystem.config.cjs
pm2 save

# Check logs
pm2 logs abcotronics-erp
```

## Verify Connection

### 1. Test Health Endpoint

```bash
curl https://abcoafrica.co.za/api/health
```

Expected response:
```json
{
  "status": "ok",
  "database": "connected",
  "admin_user": "exists"
}
```

### 2. Check Server Logs

```bash
ssh root@165.22.127.196
cd /var/www/abcotronics-erp
pm2 logs abcotronics-erp --lines 50
```

Look for:
- ✅ "Prisma database connection established"
- ❌ No connection errors

### 3. Test Database Directly

```bash
ssh root@165.22.127.196
cd /var/www/abcotronics-erp

# Test connection using Prisma
export DATABASE_URL="postgresql://doadmin:[REDACTED]@dbaas-db-6934625-nov-3-backup-do-user-28031752-0.e.db.ondigitalocean.com:25060/defaultdb?sslmode=require"
npx prisma db execute --stdin <<< "SELECT 1;"
```

## Troubleshooting

### Connection Refused

If you get connection errors:

1. **Whitelist Droplet IP**: Go to Digital Ocean dashboard → Databases → Your DB → Settings → Trusted Sources
2. **Add your droplet IP**: `165.22.127.196`

### Authentication Failed

1. Verify password is correct
2. Check username is `doadmin`
3. Make sure you're using the restored database (check host name matches)

### SSL Error

Make sure `sslmode=require` is in the connection string.

## Files to Update

On the production server (`/var/www/abcotronics-erp`):

1. **`.env`** - Main environment file
2. **`ecosystem.config.cjs`** - PM2 configuration (if exists)

⚠️ **DO NOT commit these files to git** - they contain sensitive credentials.

## Next Steps

After updating:

1. ✅ Verify app is running: https://abcoafrica.co.za
2. ✅ Test login with existing user
3. ✅ Verify data integrity (check a few records)
4. ✅ Monitor logs for any errors

## Connection String for DBeaver/Other Tools

For database management tools:

```
Host: dbaas-db-6934625-nov-3-backup-do-user-28031752-0.e.db.ondigitalocean.com
Port: 25060
Database: defaultdb
Username: doadmin
Password: [REDACTED - Use production credentials]
SSL Mode: require
```

