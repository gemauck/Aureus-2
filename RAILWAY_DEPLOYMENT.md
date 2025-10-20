# Railway Deployment Configuration

## Environment Variables Required

Set these in your Railway project dashboard:

### Required Variables:
- `JWT_SECRET` - Secret key for JWT token signing
- `DATABASE_URL` - PostgreSQL database connection string
- `NODE_ENV` - Set to "production"

### Example Values:
```
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-2024
DATABASE_URL=postgresql://username:password@host:port/database
NODE_ENV=production
```

## Deployment Steps

1. **Create Railway Project**
   - Go to [railway.app](https://railway.app)
   - Create new project
   - Connect GitHub repo or upload files

2. **Add Database Service**
   - In Railway dashboard: Add Service → Database → PostgreSQL
   - Railway will automatically set DATABASE_URL

3. **Set Environment Variables**
   - Go to project settings
   - Add JWT_SECRET variable
   - Set NODE_ENV to "production"

4. **Deploy**
   - Railway will automatically deploy from your repo
   - Or use: `railway up` command

5. **Run Database Migrations**
   ```bash
   railway run npx prisma migrate deploy
   ```

## Health Check

The application includes a health check endpoint at `/api/health` that Railway will use to monitor the service.

## API Endpoints

Once deployed, your API will be available at:
- `https://your-project-name-production.up.railway.app/api/health`
- `https://your-project-name-production.up.railway.app/api/clients`
- `https://your-project-name-production.up.railway.app/api/projects`
- etc.

## Testing Deployment

After deployment, test with:
```bash
curl https://your-project-name-production.up.railway.app/api/health
```