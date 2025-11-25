# Manual Database URL Update Instructions

The database restore is **complete and successful**! ✅

Now you need to update your production server to use the new database.

## Database Connection String

```
postgresql://doadmin:<DIGITALOCEAN_DB_PASSWORD>@dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com:25060/defaultdb?sslmode=require
```

## Option 1: SSH and Update Manually

SSH into your production server:

```bash
ssh root@165.22.127.196
cd /var/www/abcotronics-erp
```

### Update .env file:

```bash
# Backup existing .env
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)

# Update DATABASE_URL
nano .env
# Or use sed:
sed -i 's|DATABASE_URL=.*|DATABASE_URL="postgresql://doadmin:<DIGITALOCEAN_DB_PASSWORD>@dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com:25060/defaultdb?sslmode=require"|' .env
```

### Update PM2 Config (if exists):

```bash
# If you have ecosystem.config.cjs, ecosystem.config.js, or ecosystem.config.mjs
nano ecosystem.config.cjs
# Update the DATABASE_URL in the env section
```

### Regenerate Prisma Client:

```bash
npx prisma generate
```

### Restart Application:

```bash
pm2 restart abcotronics-erp
# Or if that doesn't work:
pm2 delete abcotronics-erp
pm2 start ecosystem.config.cjs
pm2 save
```

### Verify:

```bash
# Check logs
pm2 logs abcotronics-erp

# Test health endpoint (from your local machine)
curl https://abcoafrica.co.za/api/health
```

## Option 2: Copy Script to Server

You can copy the update script to the server and run it there:

```bash
# From your local machine
scp update-app-to-digitalocean-db.sh root@165.22.127.196:/tmp/

# Then SSH and run it
ssh root@165.22.127.196
chmod +x /tmp/update-app-to-digitalocean-db.sh
/tmp/update-app-to-digitalocean-db.sh
```

## Verification Steps

After updating:

1. **Check Application Health**:
   ```bash
   curl https://abcoafrica.co.za/api/health
   ```
   Should return: `{"status":"ok","database":"connected","admin_user":"exists"}`

2. **Check Server Logs**:
   ```bash
   ssh root@165.22.127.196 'cd /var/www/abcotronics-erp && pm2 logs abcotronics-erp --lines 50'
   ```

3. **Test Application**:
   - Visit: https://abcoafrica.co.za
   - Log in with your credentials
   - Verify data is present (clients, projects, etc.)

## Current Database Status

✅ **Restore Complete**
- Database Size: 14 MB
- Tables: 57
- Users: 17
- Clients: 161

The database is ready to use!

