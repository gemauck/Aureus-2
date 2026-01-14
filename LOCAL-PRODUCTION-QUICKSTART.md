# 🚀 Local Production Testing - Quick Start

Test your changes locally before deploying to avoid breaking things for live users!

## One-Time Setup

```bash
# 1. Set up the environment
npm run setup:local-prod

# 2. Edit .env and add your production values:
#    - DATABASE_URL (from production)
#    - JWT_SECRET (from production)
#    - APP_URL="http://localhost:3000"
```

## Daily Workflow

```bash
# 1. Make your code changes

# 2. Build the application
npm run build

# 3. Start local production server
npm run start:local-prod

# 4. Test at http://localhost:3000

# 5. If everything works, deploy
./deploy-to-droplet.sh
```

## Get Production Values

```bash
ssh root@165.22.127.196 'cat /var/www/abcotronics-erp/.env | grep -E "^(DATABASE_URL|JWT_SECRET)="'
```

## Using PM2 (Like Production)

```bash
npm run start:local-prod:pm2

# View logs
pm2 logs abcotronics-erp-local

# Stop
pm2 stop abcotronics-erp-local
```

## Full Documentation

See [docs/local-production-setup.md](docs/local-production-setup.md) for detailed instructions.













