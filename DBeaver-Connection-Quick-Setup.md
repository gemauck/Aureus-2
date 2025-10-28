# DBeaver Quick Connection Setup

## Step-by-Step Connection

### 1. Open DBeaver
- Launch from Applications (or Spotlight search: "DBeaver")

### 2. Create New Connection
- Click **"New Database Connection"** icon (plug symbol) in toolbar
- Select **PostgreSQL** from the list
- Click **Next**

### 3. Main Tab - Enter These Details:

```
Host: dbaas-db-6934625-do-user-28031752-0.f.db.ondigitalocean.com
Port: 25060
Database: defaultdb
Username: doadmin
Password: [Get from Digital Ocean dashboard]
```

**To get password:**
1. Visit: https://cloud.digitalocean.com/databases
2. Click your database → Users & Databases tab
3. Click "..." next to doadmin user → "Show" or reset password

### 4. SSL Tab - Critical! 
- Click **"SSL"** tab at the bottom
- ☑️ Check **"Use SSL"**
- SSL Mode: Select **"require"**
- Leave other SSL fields empty/default

### 5. Test Connection
- Click **"Test Connection"** button at bottom
- If you see "Download driver" - click Yes/OK
- Wait for "Connected" success message

### 6. Finish
- Click **"Finish"**
- Your database will appear in the left sidebar!

---

## 🔍 First Time Using DBeaver

### View Your Tables:
1. Expand connection in left sidebar
2. Expand **"Databases"** → **"defaultdb"**
3. Expand **"Schemas"** → **"public"**
4. Expand **"Tables"** to see all your tables

### Browse Data:
- Double-click any table to view data
- Right-click table → **"View Data"**
- Use SQL editor (SQL icon in toolbar) to run queries

### Common Actions:
- **View Data:** Right-click table → View Data
- **Run Query:** Click SQL icon → Type SQL → Ctrl+Enter
- **Filter Data:** When viewing table, use filter toolbar at top

---

## 🚨 Troubleshooting

### "Connection refused"
**Solution:** Whitelist your IP
1. Go to: https://cloud.digitalocean.com/databases
2. Your DB → Settings → Trusted Sources
3. Add your current IP address

### "SSL error" or "SSL required"
**Solution:** Make sure SSL is enabled
- SSL tab → Check "Use SSL" → Mode: "require"

### "Authentication failed"
**Solution:** Verify password
- Get fresh password from Digital Ocean dashboard
- Or reset password in DO dashboard

---

## 📋 Your Connection Details (Copy-Paste Ready)

**From Digital Ocean Dashboard:**
```
Host: dbaas-db-6934625-do-user-28031752-0.f.db.ondigitalocean.com
Port: 25060
Database: defaultdb
Username: doadmin
Password: [Get from dashboard]
SSL: Required
```

**Full connection string format:**
```
postgresql://doadmin:PASSWORD@dbaas-db-6934625-do-user-28031752-0.f.db.ondigitalocean.com:25060/defaultdb?sslmode=require
```

---

## ✨ Tips

1. **Save password:** DBeaver will ask to save password - say Yes for convenience
2. **Multiple connections:** You can create different named connections (Dev, Prod, etc.)
3. **SQL Editor:** Use for complex queries (Ctrl+Enter to execute)
4. **Export Data:** Right-click table → Export Data (CSV, Excel, etc.)
5. **Dark Mode:** Preferences → Appearance → Theme → Dark

Enjoy exploring your database! 🎉

