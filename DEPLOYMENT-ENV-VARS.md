# Digital Ocean App Platform - Environment Variables Setup

## Required Environment Variables

Your Digital Ocean App Platform deployment is failing because environment variables are missing. You need to configure these in the Digital Ocean console.

### How to Set Environment Variables in Digital Ocean App Platform

1. Go to your app: https://cloud.digitalocean.com/apps
2. Select your **Aureus ERP** app
3. Go to **Settings** → **App-Level Environment Variables**
4. Click **Edit** and add the following variables:

---

## Required Variables

### Database
```
DATABASE_URL=file:./prisma/dev.db
```
⚠️ **WARNING**: SQLite on App Platform will lose data on redeploy. Consider using Digital Ocean managed PostgreSQL database.

### JWT & Security
```
JWT_SECRET=0266f788ee2255e2aa973f0984903fb61f3fb1d9f528b315c9dbd0bf53fe5ea8
JWT_EXPIRY=24h
```

### Session Management
```
SESSION_DURATION=86400000
SESSION_DURATION_REMEMBER=2592000000
MAX_LOGIN_ATTEMPTS=5
ACCOUNT_LOCKOUT_DURATION=1800000
PASSWORD_HISTORY_COUNT=5
```

### Email Configuration (Gmail SMTP)
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=gemauck@gmail.com
SMTP_PASS=psrbqbzifyooosfx
EMAIL_FROM=gemauck@gmail.com
SMTP_FROM_EMAIL=noreply@abcotronics.com
SMTP_FROM_NAME=Abcotronics Security
```

### Application Settings
```
NODE_ENV=production
PORT=3000
APP_URL=https://your-app-url.digitalocean.app
```

---

## Setting Up in Digital Ocean Console

### Option 1: Individual Variables
1. Click **"Edit"** next to App-Level Environment Variables
2. Add each variable one by one
3. Click **"Save"**

### Option 2: Bulk Import (Recommended)
1. Copy all variables from above
2. In Digital Ocean, click **"Import from File"** or paste as **YAML**:
```yaml
variables:
  - key: DATABASE_URL
    value: file:./prisma/dev.db
  - key: JWT_SECRET
    value: 0266f788ee2255e2aa973f0984903fb61f3fb1d9f528b315c9dbd0bf53fe5ea8
  - key: JWT_EXPIRY
    value: 24h
  - key: SESSION_DURATION
    value: 86400000
  - key: SESSION_DURATION_REMEMBER
    value: 2592000000
  - key: MAX_LOGIN_ATTEMPTS
    value: 5
  - key: ACCOUNT_LOCKOUT_DURATION
    value: 1800000
  - key: PASSWORD_HISTORY_COUNT
    value: 5
  - key: SMTP_HOST
    value: smtp.gmail.com
  - key: SMTP_PORT
    value: 587
  - key: SMTP_USER
    value: gemauck@gmail.com
  - key: SMTP_PASS
    value: psrbqbzifyooosfx
  - key: EMAIL_FROM
    value: gemauck@gmail.com
  - key: SMTP_FROM_EMAIL
    value: noreply@abcotronics.com
  - key: SMTP_FROM_NAME
    value: Abcotronics Security
  - key: NODE_ENV
    value: production
  - key: PORT
    value: 3000
  - key: APP_URL
    value: https://your-app-url.digitalocean.app
```

3. Click **"Save"**
4. App will restart with new variables

---

## Updating APP_URL

After setting environment variables, update `APP_URL` to your actual Digital Ocean app URL:
1. Deploy once to get your app URL
2. Go back to Settings → Environment Variables
3. Update `APP_URL` to your actual URL (e.g., `https://aureus-erp-xyz.digitalocean.app`)

---

## Troubleshooting

### App Still Failing?

1. **Check Logs**: Go to Runtime Logs in Digital Ocean console
2. **Verify Variables**: Make sure all variables are set
3. **Check JWT_SECRET**: This is critical - without it, the app won't start
4. **Database Issues**: If using SQLite, data will be lost on each deploy

### Recommended: Use PostgreSQL

For production, consider using Digital Ocean managed database:

1. In your app, go to **Components**
2. Click **Add Component** → **Database**
3. Select **PostgreSQL**
4. This will automatically provide a `DATABASE_URL` environment variable

Then update your schema:
```bash
# In prisma/schema.prisma
datasource db {
  provider = "postgresql"  # Change from "sqlite"
  url      = env("DATABASE_URL")
}
```

---

## Security Notes

⚠️ **Important Security Considerations**:

1. **Gmail App Password**: The email password above is exposed. Regenerate it at: https://myaccount.google.com/apppasswords
2. **JWT_SECRET**: Generate a new secret for production:
   ```bash
   openssl rand -hex 32
   ```
3. **Environment Variables**: Consider using Digital Ocean's encrypted secrets for sensitive values

---

## Quick Deploy Checklist

- [ ] Set all environment variables in Digital Ocean console
- [ ] Update `APP_URL` to your actual app URL
- [ ] Consider switching to PostgreSQL for production
- [ ] Regenerate sensitive credentials (JWT_SECRET, SMTP_PASS)
- [ ] Deploy and monitor logs

