# 🚀 Meeting Notes - Quick Deployment

## One-Command Deployment

```bash
./deploy-meeting-notes.sh
```

## Manual Steps

### 1. Generate Prisma Client
```bash
npx prisma generate
```

### 2. Apply Migration
```bash
# Production
npx prisma migrate deploy

# Development
npx prisma migrate dev --name add_meeting_notes
```

### 3. Restart App
```bash
pm2 restart abcotronics-erp
```

## Verify

1. Go to **Teams** → **Management** → **Meeting Notes** tab
2. Click **New Month** - should create successfully
3. Click **Add Week** - should create successfully
4. Fill in department notes - should save

## If Issues

See full guide: `MEETING-NOTES-DEPLOYMENT.md`

