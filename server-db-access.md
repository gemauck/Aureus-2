# Access Database on Digital Ocean Server

## If you're already on the server (SSH'd in):

### Quick Method - Direct Port Forward
1. **On your LOCAL machine**, run:
   ```bash
   ssh -L 5555:localhost:5555 root@165.22.167.88
   ```

2. **Once connected to server**, run:
   ```bash
   cd /var/www/abcotronics-erp  # or your app directory
   npx prisma studio
   ```

3. **On your LOCAL machine**, open: http://localhost:5555

---

## Alternative: Run Prisma Studio with specific port

**On the server:**
```bash
cd /var/www/abcotronics-erp
npx prisma studio --port 5555 --browser none
```

Then forward the port from your local machine:
```bash
# In a NEW terminal on your local machine
ssh -L 5555:localhost:5555 root@165.22.167.88
```

---

## Check if DATABASE_URL is set

**On the server:**
```bash
echo $DATABASE_URL
```

If it shows a postgresql:// URL, you're good to go!

---

## If you need to set DATABASE_URL on server

**On the server:**
```bash
# Edit the .env file
nano /var/www/abcotronics-erp/.env
```

Add or update:
```
DATABASE_URL=postgresql://doadmin:PASSWORD@dbaas-db-6934625-do-user-28031752-0.f.db.ondigitalocean.com:25060/defaultdb?sslmode=require
```

Get the password from Digital Ocean dashboard → Databases → Your DB → Users & Databases

