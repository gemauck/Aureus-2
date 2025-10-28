# Free Database GUI Tools for PostgreSQL (Like TablePlus)

## 🎯 Best Free Options

### 1. **DBeaver Community** ⭐ Recommended (100% Free)
- **Why:** Completely free, open-source, cross-platform
- **Download:** https://dbeaver.io/download/
- **OS:** Mac, Windows, Linux

### 2. **TablePlus Free Version** (Free, Limited Tabs)
- **Why:** Best UI, but limited to 2 tabs in free version
- **Download:** https://tableplus.com/
- **OS:** Mac, Windows, Linux
- **Note:** Free version allows 2 open tabs, paid version is unlimited

### 3. **pgAdmin** (100% Free)
- **Why:** PostgreSQL-specific, very powerful
- **Download:** https://www.pgadmin.org/download/
- **OS:** Mac, Windows, Linux

### 4. **Beekeeper Studio** (Free & Open Source)
- **Why:** Modern UI, fully free
- **Download:** https://www.beekeeperstudio.io/
- **OS:** Mac, Windows, Linux

---

## 🚀 Quick Setup Guide

### Option 1: DBeaver (Recommended Free Option)

#### Step 1: Download & Install
```bash
# Mac - via Homebrew
brew install --cask dbeaver-community

# Or download from: https://dbeaver.io/download/
```

#### Step 2: Create Connection
1. Open DBeaver
2. Click **"New Database Connection"** (plug icon)
3. Select **PostgreSQL**
4. Click **Next**

#### Step 3: Enter Connection Details
Get these from: https://cloud.digitalocean.com/databases

**Connection Settings:**
```
Host: dbaas-db-6934625-do-user-28031752-0.f.db.ondigitalocean.com
Port: 25060
Database: defaultdb
Username: doadmin
Password: [Your password from Digital Ocean dashboard]
```

#### Step 4: Enable SSL
1. Click **"SSL"** tab
2. Check **"Use SSL"**
3. SSL Mode: **"require"**
4. Click **"Test Connection"**
5. If successful, click **"Finish"**

---

### Option 2: TablePlus Free Version

#### Step 1: Download
```bash
# Mac
brew install --cask tableplus

# Or download from: https://tableplus.com/
```

#### Step 2: Create Connection
1. Open TablePlus
2. Click **"Create a new connection"**
3. Select **PostgreSQL**

#### Step 3: Enter Details
```
Name: Digital Ocean DB (or any name)
Host: dbaas-db-6934625-do-user-28031752-0.f.db.ondigitalocean.com
Port: 25060
User: doadmin
Password: [Your password]
Database: defaultdb
```

#### Step 4: Enable SSL
1. Click **"Advanced"** or **"More Options"**
2. SSL: **"Require"**
3. Click **"Test"** then **"Connect"**

**Note:** Free version limits you to 2 open tabs. Still very usable!

---

### Option 3: pgAdmin (PostgreSQL Expert Tool)

#### Step 1: Download
```bash
# Mac - via Homebrew
brew install --cask pgadmin4

# Or download from: https://www.pgadmin.org/download/
```

#### Step 2: Setup
1. Open pgAdmin
2. Right-click **"Servers"** → **"Create"** → **"Server"**
3. General tab:
   - Name: `Digital Ocean DB`
4. Connection tab:
   ```
   Host: dbaas-db-6934625-do-user-28031752-0.f.db.ondigitalocean.com
   Port: 25060
   Database: defaultdb
   Username: doadmin
   Password: [Your password]
   ```
5. **SSL tab:**
   - SSL Mode: **"require"**
6. Click **"Save"**

---

## 🔑 Getting Your Connection Details

### From Digital Ocean Dashboard:

1. Visit: https://cloud.digitalocean.com/databases
2. Click your PostgreSQL database
3. Go to **"Users & Databases"** tab
4. You'll find:
   - **Host:** (e.g., `dbaas-db-6934625-do-user-28031752-0.f.db.ondigitalocean.com`)
   - **Port:** (e.g., `25060`)
   - **Username:** (usually `doadmin`)
   - **Password:** (click "show" or reset if needed)
   - **Database name:** (usually `defaultdb`)
   - **Connection string:** (full `postgresql://...` URL)

---

## ⚙️ SSL Configuration (Important!)

All tools need SSL enabled for Digital Ocean databases:

- **DBeaver:** SSL tab → Check "Use SSL" → Mode: "require"
- **TablePlus:** Advanced → SSL: "Require"
- **pgAdmin:** SSL tab → SSL Mode: "require"

---

## 🚨 Troubleshooting

### "Connection Refused" Error
**Fix:** Whitelist your IP in Digital Ocean
1. Go to: https://cloud.digitalocean.com/databases
2. Click your database → **Settings** → **Trusted Sources**
3. Click **"Add trusted source"**
4. Add your current IP address
5. Or select "Allow all IPs" (less secure, but easier)

### SSL Connection Error
**Fix:** Make sure SSL is enabled
- Check "Use SSL" or SSL Mode = "require" in your tool
- Verify connection string has `?sslmode=require` if using URL format

### Authentication Failed
**Fix:** Get correct password
1. Digital Ocean Dashboard → Your DB → Users & Databases
2. Reset password if needed (click "..." → Reset password)

### Can't Find Database
**Fix:** Use default database name
- Try: `defaultdb`
- Or check in Digital Ocean dashboard for actual name

---

## 💡 Recommendation by Use Case

| Use Case | Best Tool | Why |
|----------|-----------|-----|
| **Daily browsing** | TablePlus Free | Best UI, easy to use |
| **Advanced queries** | DBeaver | More features, free |
| **PostgreSQL expert** | pgAdmin | Most PostgreSQL features |
| **Modern interface** | Beekeeper Studio | Good free alternative |

---

## 🎁 Quick Install Commands

### Mac (Homebrew):
```bash
# DBeaver (Recommended)
brew install --cask dbeaver-community

# TablePlus Free
brew install --cask tableplus

# pgAdmin
brew install --cask pgadmin4

# Beekeeper Studio
brew install --cask beekeeper-studio
```

### Windows:
Download installers from:
- DBeaver: https://dbeaver.io/download/
- TablePlus: https://tableplus.com/
- pgAdmin: https://www.pgadmin.org/download/

---

## 🔗 Your Database Connection Info

Based on your project files:
```
Host: dbaas-db-6934625-do-user-28031752-0.f.db.ondigitalocean.com
Port: 25060
User: doadmin
Database: defaultdb
SSL: Required
```

**Get password from:** Digital Ocean Dashboard → Databases → Your DB → Users & Databases

---

## ✨ My Recommendation

Start with **DBeaver Community** - it's 100% free, open-source, works great, and has all features you need!

Then try **TablePlus Free** if you want a prettier UI (just 2-tab limit).

Would you like me to help you set one up? I can guide you through the connection process!

