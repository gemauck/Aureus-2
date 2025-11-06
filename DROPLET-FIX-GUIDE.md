# 🚨 Droplet Database Connection Fix

## The Problem
All API endpoints returning 500 errors - **Database connection failure on Droplet**

## ⚡ IMMEDIATE STEPS for Droplet

### Step 1: SSH into Your Droplet
```bash
ssh root@YOUR_DROPLET_IP
# or
ssh YOUR_USER@YOUR_DROPLET_IP
```

### Step 2: Check if PostgreSQL is Running
```bash
# Check PostgreSQL status
sudo systemctl status postgresql
# or
sudo service postgresql status

# If not running, start it:
sudo systemctl start postgresql
# or
sudo service postgresql start
```

### Step 3: Check Application Logs
```bash
# If using PM2:
pm2 logs --lines 100

# If using systemd:
sudo journalctl -u YOUR_SERVICE_NAME -n 100

# If running directly:
# Check the terminal where you ran the app
```

### Step 4: Check DATABASE_URL Environment Variable
```bash
# Check if DATABASE_URL is set
echo $DATABASE_URL

# Check .env file (if exists)
cat .env | grep DATABASE_URL

# Check environment variables for your app
# If using PM2:
pm2 env YOUR_APP_ID

# If using systemd, check the service file:
sudo systemctl cat YOUR_SERVICE_NAME
```

### Step 5: Test Database Connection Directly
```bash
# Test PostgreSQL connection
psql $DATABASE_URL -c "SELECT 1;"

# Or if DATABASE_URL not set, test manually:
psql -h localhost -U YOUR_USER -d YOUR_DATABASE -c "SELECT version();"
```

### Step 6: Check PostgreSQL is Listening
```bash
# Check if PostgreSQL is listening on port 5432
sudo netstat -tlnp | grep 5432
# or
sudo ss -tlnp | grep 5432

# Check PostgreSQL config
sudo cat /etc/postgresql/*/main/postgresql.conf | grep listen_addresses
sudo cat /etc/postgresql/*/main/pg_hba.conf
```

## 🔍 Common Droplet Issues

### Issue 1: PostgreSQL Not Running
**Fix:**
```bash
sudo systemctl start postgresql
sudo systemctl enable postgresql  # Enable on boot
```

### Issue 2: PostgreSQL Not Listening on Correct Interface
**Check:** `/etc/postgresql/*/main/postgresql.conf`
```ini
listen_addresses = '*'  # or 'localhost' if local only
port = 5432
```

**Fix:**
```bash
sudo nano /etc/postgresql/*/main/postgresql.conf
# Change listen_addresses to '*' or 'localhost'
sudo systemctl restart postgresql
```

### Issue 3: Firewall Blocking Connection
**Check UFW:**
```bash
sudo ufw status
```

**Allow PostgreSQL if needed:**
```bash
sudo ufw allow 5432/tcp
```

### Issue 4: DATABASE_URL Not Set in Production
**If using PM2:**
```bash
# Set environment variable
export DATABASE_URL="postgresql://user:password@localhost:5432/database"

# Or add to ecosystem.config.js:
# env: {
#   DATABASE_URL: "postgresql://..."
# }

# Restart PM2
pm2 restart all
pm2 save
```

**If using systemd:**
Edit service file:
```bash
sudo systemctl edit YOUR_SERVICE_NAME
# Add:
[Service]
Environment="DATABASE_URL=postgresql://user:password@localhost:5432/database"
```

### Issue 5: Wrong DATABASE_URL Format
**Should be:**
```
postgresql://username:password@host:port/database
```

**For local PostgreSQL:**
```
postgresql://postgres:password@localhost:5432/your_database
```

### Issue 6: Application Not Reading .env File
**Check:**
- Is `.env` file in the correct directory?
- Does the app have permission to read it?
- Is dotenv being loaded correctly?

**Fix:**
```bash
# Make sure .env is readable
chmod 644 .env

# Or set environment variables directly in PM2/systemd
```

## 🎯 Quick Diagnostic Commands

### Run on Droplet:
```bash
# 1. Check PostgreSQL status
sudo systemctl status postgresql

# 2. Check if app is running
pm2 list
# or
sudo systemctl status YOUR_APP_SERVICE

# 3. Check recent errors
pm2 logs --err --lines 50
# or
sudo journalctl -u YOUR_SERVICE -n 50 --no-pager

# 4. Test database connection
psql $DATABASE_URL -c "SELECT 1;"

# 5. Check environment variables
env | grep DATABASE
```

## 📋 Checklist

- [ ] SSH'd into droplet
- [ ] Checked PostgreSQL is running (`systemctl status postgresql`)
- [ ] Checked application logs (`pm2 logs` or `journalctl`)
- [ ] Verified DATABASE_URL is set (`echo $DATABASE_URL`)
- [ ] Tested database connection (`psql $DATABASE_URL`)
- [ ] Checked firewall rules (`ufw status`)
- [ ] Restarted application after fixing

## 🆘 Still Not Working?

Run these commands and share output:

```bash
# 1. PostgreSQL status
sudo systemctl status postgresql

# 2. Application logs (last 50 lines)
pm2 logs --lines 50

# 3. Environment check
echo "DATABASE_URL: ${DATABASE_URL:0:30}..."  # Shows first 30 chars only

# 4. Database connection test
psql $DATABASE_URL -c "SELECT version();" 2>&1

# 5. Network check
sudo netstat -tlnp | grep 5432
```

## ✅ After Fixing

1. Restart your application:
   ```bash
   pm2 restart all
   # or
   sudo systemctl restart YOUR_SERVICE
   ```

2. Test health endpoint:
   ```bash
   curl http://localhost:3000/health
   # or
   curl https://abcoafrica.co.za/health
   ```

3. Check logs to confirm no errors:
   ```bash
   pm2 logs --lines 20
   ```

---

**Most Common Fix:** PostgreSQL is not running or DATABASE_URL is not set correctly in production environment.

