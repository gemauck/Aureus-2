# Setup Options - Choose One

Since you don't have sudo access, here are your options:

## Option 1: Docker (Recommended - No Sudo Needed)

If you have Docker Desktop installed:

```bash
bash scripts/setup-with-docker.sh
```

This will:
- Start PostgreSQL in Docker (no password, no sudo)
- Create the database
- Set up everything automatically

**If you don't have Docker:**
- Download Docker Desktop: https://www.docker.com/products/docker-desktop
- Install and start it
- Then run the script above

## Option 2: Try Current PostgreSQL (If Trust Config Worked)

The config file was already modified. Try this:

```bash
# Test if it works now
createdb abcotronics_erp_local

# If that works, continue:
export DATABASE_URL="postgresql://gemau@localhost:5432/abcotronics_erp_local"
npx prisma db push --accept-data-loss
npm run dev
```

## Option 3: Use Your macOS Password

If you remember your macOS login password, you can use that for sudo:

```bash
sudo -u postgres createdb abcotronics_erp_local
```

Then continue with the setup.

## Option 4: Reset Sudo Password

If you're an admin user, you can reset your sudo password:
1. System Settings → Users & Groups
2. Click the lock and authenticate
3. Select your user → Change Password

## Recommended: Docker

Docker is the easiest option because:
- ✅ No sudo needed
- ✅ No password configuration
- ✅ Isolated from your system PostgreSQL
- ✅ Easy to start/stop
- ✅ Can be removed completely when done

Run: `bash scripts/setup-with-docker.sh`

