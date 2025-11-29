# Database Connection Update

## Connection Details

Based on the provided credentials, here's your DATABASE_URL:

```
postgresql://doadmin:AVNS_D14tRDDknkgUUoVZ4Bv@dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com:25060/defaultdb?sslmode=require
```

## Quick Update (Local Development)

Run the update script:

```bash
./update-database-connection.sh
```

This will:
- Update/create `.env` file with the DATABASE_URL
- Update `ecosystem.config.mjs` (fallback value)
- Restart your local server if needed

## Manual Update

### Local Development (.env file)

Create or update `.env` file in the project root:

```bash
DATABASE_URL="postgresql://doadmin:AVNS_D14tRDDknkgUUoVZ4Bv@dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com:25060/defaultdb?sslmode=require"
JWT_SECRET=0266f788ee2255e2aa973f0984903fb61f3fb1d9f528b315c9dbd0bf53fe5ea8
NODE_ENV=production
PORT=3000
APP_URL=https://abcoafrica.co.za
```

### Production Server Update

**⚠️ IMPORTANT: Update the production server's .env file directly via SSH**

1. SSH into your production server:
   ```bash
   ssh root@abcoafrica.co.za
   ```

2. Navigate to your application directory:
   ```bash
   cd /path/to/your/app  # Replace with actual path
   ```

3. Edit the `.env` file:
   ```bash
   nano .env
   # or
   vi .env
   ```

4. Update or add the DATABASE_URL line:
   ```
   DATABASE_URL="postgresql://doadmin:AVNS_D14tRDDknkgUUoVZ4Bv@dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com:25060/defaultdb?sslmode=require"
   ```

5. Save and exit (Ctrl+X, then Y, then Enter for nano)

6. Restart PM2 with updated environment:
   ```bash
   pm2 restart all --update-env
   ```

7. Check PM2 logs to verify connection:
   ```bash
   pm2 logs abcotronics-erp --lines 50
   ```

## Verify Connection

After updating, check the server logs for:
- ✅ `Prisma database connection established`
- ✅ `Prisma client initialized`
- ❌ Any connection errors

## Security Notes

1. **Never commit `.env` file to git** - It contains sensitive credentials
2. **The `.env` file should be in `.gitignore`** - Verify this is set
3. **Use environment variables on production** - Don't hardcode in source files
4. **Rotate credentials if exposed** - If these credentials were shared publicly, rotate them in Digital Ocean dashboard

## Connection String Breakdown

- **Protocol**: `postgresql://`
- **Username**: `doadmin`
- **Password**: `AVNS_D14tRDDknkgUUoVZ4Bv` (URL-encoded if needed)
- **Host**: `dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com`
- **Port**: `25060`
- **Database**: `defaultdb`
- **SSL Mode**: `require` (required for Digital Ocean)

## Troubleshooting

If you still see 500 errors after updating:

1. **Check server logs**:
   ```bash
   pm2 logs abcotronics-erp --lines 100
   ```

2. **Verify DATABASE_URL is set**:
   ```bash
   pm2 env 0 | grep DATABASE_URL
   ```

3. **Test connection manually**:
   ```bash
   node -e "console.log(process.env.DATABASE_URL)"
   ```

4. **Check firewall/network**: Ensure the server can reach Digital Ocean database on port 25060

5. **Verify database is running**: Check Digital Ocean dashboard

## Next Steps

After updating the DATABASE_URL:
1. Restart the server
2. Monitor logs for connection success
3. Test API endpoints to verify they're working
4. Check that the 500 errors are resolved
