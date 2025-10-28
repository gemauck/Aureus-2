# How to View Your PostgreSQL Database on Digital Ocean

You have several options to view and manage your database. Choose the one that works best for you!

## 📋 Quick Summary

### Option 1: Prisma Studio (Easiest - Visual GUI)
- Best for: Browsing and editing data visually
- Time: 2 minutes

### Option 2: Digital Ocean Console (Built-in)
- Best for: Quick SQL queries
- Time: Instant

### Option 3: Desktop GUI Tools (TablePlus, pgAdmin, DBeaver)
- Best for: Advanced database management
- Time: 5-10 minutes setup

---

## 🎨 Option 1: Prisma Studio (Recommended)

### Step 1: Get Connection String
1. Visit: https://cloud.digitalocean.com/databases
2. Click your PostgreSQL database cluster
3. Go to **"Users & Databases"** tab
4. Copy the **Connection String** (starts with `postgresql://`)

### Step 2: Connect Locally
```bash
# Make sure you have your connection string ready
./quick-db-connect.sh
# Paste the connection string when prompted
```

OR manually:
```bash
# 1. Create/update .env file with connection string
echo 'DATABASE_URL=postgresql://doadmin:PASSWORD@dbaas-db-6934625-do-user-28031752-0.f.db.ondigitalocean.com:25060/defaultdb?sslmode=require' > .env

# 2. Start Prisma Studio
npx prisma studio
```

### Step 3: View Database
- Opens at: http://localhost:5555
- Browse tables, view/edit data, run queries

---

## 🌐 Option 2: Digital Ocean Console

### Access Built-in Query Console
1. Visit: https://cloud.digitalocean.com/databases
2. Click your database cluster
3. Click **"Console"** tab
4. Run SQL queries directly in the browser

**Note:** This is read-only, but good for quick queries.

---

## 🖥️ Option 3: Desktop GUI Tools

### TablePlus (Recommended - Free trial, Mac/Windows)

1. **Download:** https://tableplus.com/
2. **Create new PostgreSQL connection:**
   - Host: `dbaas-db-6934625-do-user-28031752-0.f.db.ondigitalocean.com`
   - Port: `25060`
   - User: `doadmin`
   - Password: (from Digital Ocean dashboard)
   - Database: `defaultdb`
   - SSL: **Required** (enable SSL mode)

3. **Connect and browse!**

### pgAdmin (Free - Advanced)

1. **Download:** https://www.pgadmin.org/
2. **Create server connection:**
   - SSL Mode: `require`
   - Use connection details from Digital Ocean dashboard

### DBeaver (Free - Cross-platform)

1. **Download:** https://dbeaver.io/
2. **Create PostgreSQL connection:**
   - Enable SSL
   - Use connection string from Digital Ocean

---

## 🔧 Option 4: Command Line (psql)

If you have `psql` installed:

```bash
# Use connection string from Digital Ocean
psql "postgresql://doadmin:PASSWORD@dbaas-db-6934625-do-user-28031752-0.f.db.ondigitalocean.com:25060/defaultdb?sslmode=require"
```

Common commands:
```sql
\l          -- List databases
\dt         -- List tables
\d table_name  -- Describe table structure
SELECT * FROM users LIMIT 10;  -- Query data
```

---

## 🚀 Option 5: Access via Server (Droplet)

If you want to access the database through your droplet:

```bash
# SSH with port forwarding
ssh -L 5555:localhost:5555 root@165.22.127.196

# Once connected to server
cd /var/www/abcotronics-erp
npx prisma studio --port 5555
```

Then open http://localhost:5555 on your local machine.

---

## 🔐 Security: Whitelist Your IP

If you get "connection refused" errors:

1. Go to: https://cloud.digitalocean.com/databases
2. Click your database cluster
3. Go to **"Settings"** → **"Trusted Sources"**
4. Click **"Add trusted source"**
5. Add your current IP address
6. Or select "Allow all IPs" (less secure)

---

## 📝 Where to Find Connection Details

**Digital Ocean Dashboard:**
1. https://cloud.digitalocean.com/databases
2. Click your PostgreSQL database
3. **"Users & Databases"** tab:
   - Connection String (copy this)
   - Host, Port, User, Password
   - Database name

---

## 🐛 Troubleshooting

### Connection Refused
- ✅ Check IP is whitelisted in Digital Ocean
- ✅ Verify connection string is correct
- ✅ Try from different network

### SSL Error
- ✅ Make sure connection string includes `?sslmode=require`
- ✅ Enable SSL in your GUI tool settings

### Authentication Failed
- ✅ Verify password from Digital Ocean dashboard
- ✅ Reset password in Digital Ocean if needed

### Can't Find .env File
- ✅ Create it: `touch .env`
- ✅ Add: `DATABASE_URL="your_connection_string"`

---

## 💡 Recommended Workflow

For day-to-day use:
1. **Prisma Studio** for browsing/editing data
2. **Digital Ocean Console** for quick queries
3. **TablePlus** for advanced operations

---

## 🔗 Useful Links

- [Digital Ocean Databases](https://cloud.digitalocean.com/databases)
- [Prisma Studio Docs](https://www.prisma.io/studio)
- [PostgreSQL Connection Guide](https://www.postgresql.org/docs/current/libpq-connect.html)

