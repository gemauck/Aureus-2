# DBeaver Connection Guide for PostgreSQL Database

## Step 1: Get Your Database Connection Details

### Option A: From DigitalOcean Dashboard (Recommended)
1. Go to: https://cloud.digitalocean.com/databases
2. Click on your PostgreSQL database cluster
3. Go to the **"Users & Databases"** tab
4. You'll see:
   - **Host**: `dbaas-db-6934625-do-user-28031752-0.f.db.ondigitalocean.com` (or similar)
   - **Port**: `25060`
   - **Database**: `defaultdb`
   - **User**: `doadmin`
   - **Password**: Click "Reset Password" if you don't have it, or check your saved credentials

### Option B: From Your .env File
If you have a `.env` file in your project, look for `DATABASE_URL`:
```
DATABASE_URL=postgresql://doadmin:PASSWORD@HOST:25060/defaultdb?sslmode=require
```

Extract:
- **Host**: The part after `@` and before `:25060`
- **Port**: `25060`
- **Database**: `defaultdb`
- **User**: `doadmin`
- **Password**: The part after `doadmin:` and before `@`

## Step 2: Install DBeaver (if not already installed)

1. Download DBeaver: https://dbeaver.io/download/
2. Install the application
3. Open DBeaver

## Step 3: Create New Database Connection in DBeaver

1. **Click "New Database Connection"** (plug icon) or go to `Database` → `New Database Connection`

2. **Select PostgreSQL** from the list of databases
   - Search for "PostgreSQL" if needed
   - Click "Next"

3. **Enter Connection Details:**
   
   **Main Tab:**
   - **Host**: `dbaas-db-6934625-do-user-28031752-0.f.db.ondigitalocean.com` (your actual host from Step 1)
   - **Port**: `25060`
   - **Database**: `defaultdb`
   - **Username**: `doadmin`
   - **Password**: Enter your password (check "Save password" if you want)

4. **Configure SSL (IMPORTANT):**
   - Click on the **"SSL"** tab
   - Check **"Use SSL"**
   - Set **SSL Mode**: `require` (or `verify-full` for more security)
   - You can leave other SSL settings as default

5. **Test Connection:**
   - Click **"Test Connection"** button at the bottom
   - If this is your first time, DBeaver may ask to download PostgreSQL driver - click "Download"
   - You should see: ✅ "Connected"

6. **Save Connection:**
   - Click **"Finish"** to save the connection
   - Give it a name like "Abcotronics ERP Production DB"

## Step 4: Connect and Explore

1. **Open the connection** from the Database Navigator (left sidebar)
2. **Browse your database:**
   - Expand the connection
   - Expand "Databases" → "defaultdb" → "Schemas" → "public" → "Tables"
   - You'll see all your tables (User, Project, Client, etc.)

## Troubleshooting

### Connection Refused / Timeout
- **Check IP Whitelist**: Your IP address must be whitelisted in DigitalOcean
  1. Go to your database in DigitalOcean dashboard
  2. Click "Settings" → "Trusted Sources"
  3. Add your current IP address
  4. Wait a few minutes for changes to propagate

### SSL Error
- Make sure SSL is enabled in DBeaver (SSL tab)
- Set SSL Mode to `require` or `verify-full`
- The connection string should include `?sslmode=require`

### Authentication Failed
- Double-check your password
- You may need to reset the password in DigitalOcean dashboard
- Make sure you're using the `doadmin` user

### Driver Not Found
- DBeaver will prompt to download the PostgreSQL driver automatically
- If it doesn't, go to `Help` → `Install New Software` → Search for "PostgreSQL"

## Security Notes

⚠️ **Important:**
- Never commit your database password to git
- The `.env` file should be in `.gitignore`
- Consider using DBeaver's password manager or environment variables for passwords
- Only connect from trusted networks

## Quick Connection String Format

If you prefer using connection string directly:
```
postgresql://doadmin:YOUR_PASSWORD@HOST:25060/defaultdb?sslmode=require
```

You can also use this in DBeaver's connection string field (Advanced tab).



