# Quick Start Guide

## Step 1: Navigate to Project Directory

```bash
cd "/Users/gemau/Documents/Project ERP/abcotronics-erp-modular"
```

## Step 2: Choose Your Setup Method

### Option A: Docker (Easiest - No Sudo)

**First, install Docker Desktop:**
1. Download: https://www.docker.com/products/docker-desktop
2. Install and start Docker Desktop
3. Wait for Docker to start (whale icon in menu bar)

**Then run:**
```bash
bash scripts/setup-with-docker.sh
```

### Option B: Use macOS Password for Sudo

Your macOS login password is your sudo password. Try:

```bash
sudo -u postgres createdb abcotronics_erp_local
```

Enter your **macOS login password** (the one you use to log into your Mac).

### Option C: Try Direct Connection (If Config Fixed)

The PostgreSQL config was already modified. Try:

```bash
createdb abcotronics_erp_local
```

If this works without asking for a password, continue with:

```bash
# Create .env.local
cat > .env.local << 'EOF'
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:3000
DATABASE_URL="postgresql://gemau@localhost:5432/abcotronics_erp_local"
JWT_SECRET=0266f788ee2255e2aa973f0984903fb61f3fb1d9f528b315c9dbd0bf53fe5ea8
DEV_LOCAL_NO_DB=false
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=gemauck@gmail.com
SMTP_PASS=psrbqbzifyooosfx
EMAIL_FROM=gemauck@gmail.com
SMTP_FROM_EMAIL=noreply@abcotronics.com
SMTP_FROM_NAME=Abcotronics Security
EOF

# Set up schema
export DATABASE_URL="postgresql://gemau@localhost:5432/abcotronics_erp_local"
npx prisma db push --accept-data-loss

# Start dev server
npm run dev
```

## Recommended: Docker

Docker is the easiest because:
- ✅ No sudo needed
- ✅ No password configuration  
- ✅ Works immediately
- ✅ Easy to remove later

Just install Docker Desktop and run the script!





