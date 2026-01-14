# Local Production Environment Setup

This guide helps you set up a local environment that matches your droplet (production) environment, so you can test changes before deploying to live users.

## Why Use This?

- **Test before deploying**: Catch issues before they affect live users
- **Match production exactly**: Same build process, same environment variables, same runtime
- **Safe testing**: Test database migrations, API changes, and UI updates locally first

## Quick Start

### 1. Initial Setup (One-time)

```bash
npm run setup:local-prod
```

This will:
- Create a `.env` file from the template (if it doesn't exist)
- Check for required environment variables
- Install dependencies
- Generate Prisma client
- Build the application (matching production build)

### 2. Configure Environment Variables

Edit the `.env` file and add your production-like values. You'll need at minimum:

- `DATABASE_URL` - Your production database connection string
- `JWT_SECRET` - Your production JWT secret
- `APP_URL` - Set to `http://localhost:3000` for local testing
- `PORT` - Set to `3000` (or your preferred port)

**To get production values**, SSH into your droplet:

```bash
ssh root@165.22.127.196 'cat /var/www/abcotronics-erp/.env | grep -E "^(DATABASE_URL|JWT_SECRET|APP_URL)="'
```

**⚠️ Security Note**: The `.env` file is gitignored and should never be committed. It's safe to use production credentials here since it's only on your local machine.

### 3. Start the Local Production Server

You have two options:

#### Option A: Simple Node.js (Recommended for testing)

```bash
npm run start:local-prod
```

This runs the server directly with Node.js. Press `Ctrl+C` to stop.

#### Option B: PM2 (Matches production exactly)

```bash
npm run start:local-prod:pm2
```

This uses PM2 process manager, exactly like production. Useful commands:

```bash
# View logs
pm2 logs abcotronics-erp-local

# Stop server
pm2 stop abcotronics-erp-local

# Delete PM2 process
pm2 delete abcotronics-erp-local

# View status
pm2 status
```

## Workflow

### Typical Development Workflow

1. **Make your changes** in the codebase
2. **Rebuild** the application:
   ```bash
   npm run build
   ```
3. **Restart** the local production server:
   ```bash
   # If using simple Node.js
   npm run start:local-prod
   
   # If using PM2
   pm2 restart abcotronics-erp-local
   ```
4. **Test** at `http://localhost:3000`
5. **Deploy** to droplet only after local testing passes

### Before Deploying

Always test locally first:

```bash
# 1. Build
npm run build

# 2. Start local production server
npm run start:local-prod

# 3. Run tests (in another terminal)
npm run test:deploy

# 4. Manually test in browser at http://localhost:3000

# 5. If everything works, deploy
./deploy-to-droplet.sh
```

## Differences from Development Mode

| Feature | Development (`npm run dev`) | Local Production (`npm run start:local-prod`) |
|---------|---------------------------|-----------------------------------------------|
| Build | No build, hot reload | Full production build required |
| Environment | `.env.local` | `.env` |
| NODE_ENV | `development` | `production` |
| Process Manager | None | Optional PM2 |
| Hot Reload | Yes | No (must rebuild) |
| Matches Production | ❌ No | ✅ Yes |

## Troubleshooting

### "DATABASE_URL not found"

Make sure your `.env` file has a `DATABASE_URL` entry. You can copy it from production:

```bash
ssh root@165.22.127.196 'grep DATABASE_URL /var/www/abcotronics-erp/.env'
```

### "Build not found"

Run the build command:

```bash
npm run build
```

### "Port already in use"

Change the port in your `.env` file:

```env
PORT=3001
```

Or stop the process using the port:

```bash
# Find process using port 3000
lsof -ti:3000

# Kill it
kill -9 $(lsof -ti:3000)
```

### PM2 process won't stop

```bash
pm2 delete abcotronics-erp-local
pm2 kill  # Nuclear option - kills all PM2 processes
```

### Database connection issues

- Verify your `DATABASE_URL` is correct
- Check if your IP is whitelisted in the database (DigitalOcean databases may require IP whitelisting)
- Test connection:
  ```bash
  npx prisma db pull
  ```

## Environment Variables Reference

See `docs/env.template` for all available environment variables. The most important ones for local production testing are:

- `NODE_ENV=production` - Required for production mode
- `PORT=3000` - Server port
- `APP_URL=http://localhost:3000` - Application URL (use localhost for local testing)
- `DATABASE_URL` - Database connection string (can use production DB)
- `JWT_SECRET` - JWT signing secret (use production secret)
- `FORCE_SECURE_COOKIES=false` - Set to false for local testing (production uses true)

## Tips

1. **Use production database**: You can connect to the same production database for realistic testing, but be careful not to modify production data
2. **Keep builds fresh**: Always rebuild after making changes: `npm run build`
3. **Check logs**: If something breaks, check the console output or PM2 logs
4. **Test thoroughly**: Test all the features you changed before deploying
5. **Use PM2 for long sessions**: If you're testing for a while, PM2 is better as it auto-restarts on crashes

## Next Steps

After setting up local production:

1. Test your changes locally
2. Run deployment tests: `npm run test:deploy`
3. Deploy to droplet: `./deploy-to-droplet.sh`

Happy testing! 🚀











