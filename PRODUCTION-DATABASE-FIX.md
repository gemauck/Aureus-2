# Production Server Database Connection Fix

## ⚡ Quick Fix - Run This on Production Server

SSH into your production server and run:

```bash
# SSH into server
ssh root@abcoafrica.co.za

# Navigate to your app directory (adjust path as needed)
cd /var/www/abcotronics-erp
# OR
cd /home/deploy/abcotronics-erp
# OR wherever your app is located

# Upload and run the update script
# (You can copy-paste the script content or upload it)
bash update-production-database.sh
```

## Manual Fix (If Script Doesn't Work)

### Step 1: SSH into Production Server

```bash
ssh root@abcoafrica.co.za
```

### Step 2: Find Your Application Directory

```bash
# Common locations:
cd /var/www/abcotronics-erp
# OR
cd /home/deploy/abcotronics-erp
# OR
cd /opt/abcotronics-erp

# If not sure, find where server.js is:
find / -name "server.js" -type f 2>/dev/null | grep -v node_modules
```

### Step 3: Edit .env File

```bash
nano .env
# OR
vi .env
```

### Step 4: Add/Update DATABASE_URL

Add or update this line in the `.env` file:

**⚠️ SECURITY: Use environment variables, never hardcode passwords:**

```bash
# Set password as environment variable first
export DB_PASSWORD="your-password-here"
# Then set in .env
echo "DATABASE_URL=\"postgresql://doadmin:\${DB_PASSWORD}@dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com:25060/defaultdb?sslmode=require\"" >> .env
```

**Important**: Make sure the entire URL is on one line and wrapped in quotes.

### Step 5: Save and Exit

- **nano**: Press `Ctrl+X`, then `Y`, then `Enter`
- **vi**: Press `Esc`, type `:wq`, then `Enter`

### Step 6: Restart PM2

```bash
# Restart with updated environment variables
pm2 restart all --update-env

# OR restart specific app
pm2 restart abcotronics-erp --update-env
```

### Step 7: Verify Connection

```bash
# Check PM2 logs
pm2 logs --lines 50

# Look for these success messages:
# ✅ Prisma database connection established
# ✅ Prisma client initialized

# If you see connection errors, check:
# - Database server is accessible
# - Firewall allows port 25060
# - Credentials are correct
```

## Test the Fix

After updating and restarting, test the API:

```bash
# Test from server
curl https://abcoafrica.co.za/api/me

# Should return user data, not 500 error
```

Or test from your browser:
- Open: `https://abcoafrica.co.za/api/projects`
- Should return JSON data, not 500 error

## Troubleshooting

### Still Getting 500 Errors?

1. **Check PM2 logs**:
   ```bash
   pm2 logs --lines 100 | grep -i "database\|prisma\|error"
   ```

2. **Verify DATABASE_URL is loaded**:
   ```bash
   pm2 env 0 | grep DATABASE_URL
   # Should show your DATABASE_URL (password will be visible)
   ```

3. **Test database connection manually**:
   ```bash
   # Install psql if not available
   # Then test connection (use environment variable for password):
   export DB_PASSWORD="your-password-here"
   psql "postgresql://doadmin:${DB_PASSWORD}@dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com:25060/defaultdb?sslmode=require" -c "SELECT 1;"
   ```

4. **Check firewall/network**:
   ```bash
   # Test if port is accessible
   telnet dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com 25060
   # OR
   nc -zv dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com 25060
   ```

5. **Verify database is running**:
   - Check Digital Ocean dashboard
   - Ensure database cluster is active

### Common Issues

**Issue**: "DATABASE_URL is not set"
- **Fix**: Make sure `.env` file exists and has `DATABASE_URL=` line
- **Fix**: Restart PM2 with `--update-env` flag

**Issue**: "Can't reach database server"
- **Fix**: Check firewall rules in Digital Ocean
- **Fix**: Verify database cluster is running
- **Fix**: Check network connectivity from server

**Issue**: "Authentication failed"
- **Fix**: Verify username and password are correct
- **Fix**: Check if password needs URL encoding (special characters)

## Security Notes

⚠️ **Important Security Reminders**:

1. The `.env` file contains sensitive credentials
2. Never commit `.env` to git (it's in `.gitignore`)
3. Only update `.env` on the server directly via SSH
4. Consider rotating credentials if they were exposed
5. Use environment variables in production, not hardcoded values

## Verification Checklist

After updating, verify:

- [ ] `.env` file contains correct `DATABASE_URL`
- [ ] PM2 restarted with `--update-env` flag
- [ ] PM2 logs show "Prisma database connection established"
- [ ] API endpoints return 200 OK (not 500)
- [ ] `/api/me` endpoint works
- [ ] `/api/projects` endpoint works
- [ ] `/api/users` endpoint works

## Need Help?

If issues persist:
1. Check PM2 logs: `pm2 logs --lines 100`
2. Check server error logs: `tail -f logs/pm2-error.log`
3. Verify database is accessible from server
4. Check Digital Ocean database dashboard for status

