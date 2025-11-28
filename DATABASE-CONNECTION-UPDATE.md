# Database Connection Update

## New Database Credentials

The database connection has been updated with the following credentials:

- **Host**: `dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com`
- **Port**: `25060`
- **Database**: `defaultdb`
- **Username**: `doadmin`
- **Password**: `[REDACTED - See .env file on server]`
- **SSL Mode**: `require`

## Connection String

```
postgresql://doadmin:[PASSWORD]@dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com:25060/defaultdb?sslmode=require
```

## Update Production Server

### Option 1: Automated Script (Recommended)

Run the automated update script:

```bash
./update-database-connection.sh
```

This script will:
1. Connect to the production server
2. Backup the existing `.env` file
3. Update the `DATABASE_URL` in `.env`
4. Test the database connection
5. Regenerate Prisma client
6. Restart the application with PM2

### Option 2: Manual Update via SSH

SSH into the production server and update manually:

```bash
ssh root@abcoafrica.co.za
cd /var/www/abcotronics-erp

# Backup existing .env
cp .env .env.backup

# Update DATABASE_URL in .env
# Remove old DATABASE_URL line, then add:
echo 'DATABASE_URL="postgresql://doadmin:[PASSWORD]@dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com:25060/defaultdb?sslmode=require"' >> .env

# Regenerate Prisma client
npx prisma generate

# Restart application
pm2 restart abcotronics-erp
pm2 save
```

## Update Local Development

For local development, create or update your `.env` file:

```bash
# Create .env file
cat > .env << 'EOF'
DATABASE_URL="postgresql://doadmin:[PASSWORD]@dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com:25060/defaultdb?sslmode=require"
JWT_SECRET=0266f788ee2255e2aa973f0984903fb61f3fb1d9f528b315c9dbd0bf53fe5ea8
NODE_ENV=development
PORT=3000
EOF

# Regenerate Prisma client
npx prisma generate
```

## Verify Connection

After updating, verify the connection works:

```bash
# Test database connection
npx prisma db execute --stdin <<< "SELECT 1;"

# Or test via API
curl https://abcoafrica.co.za/api/health
```

## Troubleshooting

### Connection Errors

If you see connection errors:

1. **Check firewall rules**: Ensure the production server IP is allowed in DigitalOcean database firewall
2. **Verify credentials**: Double-check username and password
3. **Check SSL**: Ensure `sslmode=require` is set
4. **Test connection**: Use `psql` or Prisma Studio to test directly

### PM2 Not Restarting

If PM2 doesn't restart:

```bash
# Check PM2 status
pm2 status

# Restart manually
pm2 restart abcotronics-erp

# Or start fresh
pm2 delete abcotronics-erp
pm2 start ecosystem.config.mjs
pm2 save
```

### Prisma Client Issues

If Prisma client generation fails:

```bash
# Clear Prisma cache
rm -rf node_modules/.prisma

# Regenerate
npx prisma generate

# Restart application
pm2 restart abcotronics-erp
```

## Security Notes

⚠️ **Important**: 
- Never commit `.env` files to git
- The password is stored in plain text in `.env` (this is standard for connection strings)
- Ensure `.env` files have proper permissions (600) on the server
- Consider using environment variables in your deployment platform instead of `.env` files

## Files Updated

- ✅ `ecosystem.config.mjs` - Updated with new connection string (fallback)
- ✅ `update-database-connection.sh` - Created automated update script
- ✅ `DATABASE-CONNECTION-UPDATE.md` - This documentation

