# Deployment Testing Guide

This project includes automated deployment tests to ensure that deployments don't break site functionality.

## Overview

The deployment test suite (`tests/deployment-test.js`) runs automatically before every deployment to verify critical functionality:

- ✅ Health check endpoint
- ✅ Server startup
- ✅ Database connection
- ✅ Build files exist
- ✅ API routes respond
- ✅ Environment variables configured
- ✅ Prisma client generation
- ✅ Static assets available

## Running Tests

### Manual Testing

```bash
# Run tests locally
npm run test

# Or run deployment tests specifically
npm run test:deploy
```

### Before Deployment

Tests automatically run when you deploy:

```bash
# Tests run automatically before deployment
npm run deploy

# Or use the deployment script directly
./deploy-production.sh
```

The deployment will be **blocked** if critical tests fail.

## Test Configuration

Tests use the following environment variables:

- `APP_URL` or `TEST_URL` - URL to test against (default: `http://localhost:3000`)
- `DATABASE_URL` - Database connection string
- `JWT_SECRET` - JWT secret for authentication

## CI/CD Integration

### GitHub Actions

Tests run automatically on every push and pull request via GitHub Actions (`.github/workflows/ci.yml`).

### Deployment Scripts

- `deploy-production.sh` - Runs tests before and after deployment
- `deploy-to-droplet.sh` - Runs tests before and after deployment

## Test Results

### Success
- ✅ All critical tests passed
- ✅ Deployment proceeds
- Exit code: 0

### Failure
- ❌ Critical tests failed
- ❌ Deployment blocked
- Exit code: 1

### Warnings
- ⚠️ Non-critical tests failed
- ⚠️ Deployment can proceed
- Exit code: 0

## Adding New Tests

To add new tests, edit `tests/deployment-test.js`:

1. Create a new test function
2. Add it to the critical or non-critical test arrays
3. Use `logTest()` to report results

Example:
```javascript
async function testNewFeature() {
    console.log('\n🧪 Testing New Feature...')
    const result = await testAPIEndpoint('new-endpoint')
    logTest('New Feature', result.ok, result.error || 'OK', true) // true = critical
    return result.ok
}
```

## Troubleshooting

### Tests Fail Locally

1. Ensure server is running: `npm start`
2. Check environment variables are set
3. Verify database is accessible
4. Check that build files exist (`npm run build`)

### Tests Fail in CI

1. Check GitHub Actions logs
2. Verify test database is created
3. Ensure server starts successfully
4. Check environment variables in CI workflow

### Tests Fail on Deployment

1. Review test output for specific failures
2. Check server logs on deployment target
3. Verify environment variables on server
4. Check database connectivity

## Test Timeout

Tests have a 30-second timeout per test. If tests timeout:
- Check server is responding
- Verify network connectivity
- Check server logs for errors

