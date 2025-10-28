# How to View Your Digital Ocean Database Locally

## Quick Start

1. **Get your connection string from Digital Ocean:**
   - Visit: https://cloud.digitalocean.com/databases
   - Click your PostgreSQL database cluster
   - Go to "Users & Databases" tab
   - Copy the **Connection String** (starts with `postgresql://`)

2. **Run the setup script:**
   ```bash
   ./setup-local-db.sh
   ```
   Then paste your connection string when prompted.

3. **Or manually create `.env` file:**
   ```bash
   # Create .env file with your database URL
   echo 'DATABASE_URL=postgresql://doadmin:YOUR_PASSWORD@dbaas-db-6934625-do-user-28031752-0.f.db.ondigitalocean.com:25060/defaultdb?sslmode=require' > .env
   echo 'JWT_SECRET=0266f788ee2255e2aa973f0984903fb61f3fb1d9f528b315c9dbd0bf53fe5ea8' >> .env
   echo 'NODE_ENV=development' >> .env
   echo 'PORT=3000' >> .env
   ```

4. **Start Prisma Studio:**
   ```bash
   npx prisma studio
   ```

5. **Open in browser:**
   - Visit: http://localhost:5555 (or check terminal for the port)

## Alternative: Use PostgreSQL GUI Tools

### Option 1: TablePlus (Recommended - Free trial)
1. Download: https://tableplus.com/
2. Create new PostgreSQL connection
3. Enter connection details:
   - **Host:** `dbaas-db-6934625-do-user-28031752-0.f.db.ondigitalocean.com`
   - **Port:** `25060`
   - **User:** `doadmin`
   - **Password:** (from Digital Ocean dashboard)
   - **Database:** `defaultdb`
   - **SSL:** Required

### Option 2: pgAdmin
1. Download: https://www.pgadmin.org/
2. Create new server connection with SSL mode: require

### Option 3: DBeaver (Free)
1. Download: https://dbeaver.io/
2. Create PostgreSQL connection with SSL enabled

## Digital Ocean Dashboard Access

You can also view your database directly in Digital Ocean:
1. Go to: https://cloud.digitalocean.com/databases
2. Click your database cluster
3. Use the "Console" tab to run SQL queries

## Security Note

⚠️ **Important:** Your `.env` file contains sensitive credentials. Make sure:
- It's in `.gitignore` (should already be ignored)
- Never commit it to git
- Don't share it publicly

## Troubleshooting

### Connection Refused
- Check your IP is whitelisted in Digital Ocean database settings
- Go to Database → Settings → Trusted Sources
- Add your IP address

### SSL Error
- Make sure `?sslmode=require` is in your connection string
- Some tools require enabling SSL/SSL Mode: require

### Can't Find Connection String
- Make sure you're in the "Users & Databases" tab
- Look for "Connection String" or "Connection Details"
- You may need to reset the password if you don't have it

