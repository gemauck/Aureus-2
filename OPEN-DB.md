# Quick Database Access

## One-Click Setup

Run this command and paste your connection string when prompted:

```bash
./connect-db.sh
```

## Manual Setup (2 steps)

**Step 1:** Get connection string from:
👉 https://cloud.digitalocean.com/databases

Then click your database → "Users & Databases" tab → Copy the connection string

**Step 2:** Update .env file:

Replace `YOUR_PASSWORD_HERE` in `.env.template` with your actual connection string, or run:

```bash
# Edit the .env file with your connection string
nano .env
```

Then restart Prisma Studio:
```bash
npx prisma studio
```

Open: http://localhost:5555

---

## Your Database Info:

- **Host:** `dbaas-db-6934625-do-user-28031752-0.f.db.ondigitalocean.com`
- **Port:** `25060`
- **Database:** `defaultdb`
- **User:** `doadmin`
- **Password:** (Get from Digital Ocean dashboard)

