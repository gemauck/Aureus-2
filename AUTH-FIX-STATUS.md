# Authentication Fix Click - October 2025

## Issues Identified

### 1. CORS Configuration Issue
**Problem:** The `withHttp` middleware in `api/_lib/withHttp.js` was not allowing requests from `abcoafrica.co.za`

**Error:** 401 Unauthorized on `/api/auth/refresh` - "No refresh token"

**Root Cause:** The allowed origins list was missing `abcoafrica.co.za` domains

### 2. Cookie Security Flag Issue
**Problem:** The Secure flag on cookies was being set incorrectly as a string instead of a boolean condition

**Error:** 500 Internal Server Error on `/api/login` - "Login failed"

**Root Cause:** The cookie was being set with `Secure=${process.env.NODE_ENV === 'production'}` which evaluates to a string "true" or "false", not a boolean

## Fixes Applied

### ✅ Fix 1: Added abcoafrica.co.za to Allowed Origins
**File:** `api/_lib/withHttp.js`

Added the following domains to the allowed origins list:
- `https://abcoafrica.co.za`
- `http://abcoafrica.co.za`
- `https://www.abcoafrica.co.za`
- `http://www.abcoafrica.co.za`

### ✅ Fix 2: Fixed Cookie Secure Flag
**Files:** 
- `api/auth/login.js`
- `api/auth/refresh.js`
- `api/auth/logout.js`

Changed from:
```javascript
Secure=${process.env.NODE_ENV === 'production'}
```

To:
```javascript
const isSecure = process.env.NODE_ENV === 'production' || process.env.FORCE_SECURE_COOKIES === 'true'
const cookieValue = `refreshToken=${refreshToken}; HttpOnly; Path=/; SameSite=Lax${isSecure ? '; Secure' : ''}`
```

This ensures:
- In production (NODE_ENV=production): Secure flag is set
- In development: Secure flag is not set (allows http://localhost)
- Can be overridden with FORCE_SECURE_COOKIES env var

## Next Steps

### 1. Deploy Updated Code
The fixes have been made to the codebase. You need to:
1. Commit these changes to your repository
2. Push to your production branch
3. Restart your production server

### 2. Verify Server Configuration
Make sure your production server at `abcoafrica.co.za` has the following environment variables set:

```bash
NODE_ENV=production
JWT_SECRET=<your-secret-key>
DATABASE_URL=<your-database-url>
FORCE_SECURE_COOKIES=true  # Optional: force secure cookies even if not in production mode
```

### 3. Test Authentication Flow
After deployment, test:
1. Login with valid credentials
2. Verify refresh token is stored in cookie
3. Verify access token is returned
4. Check that user data loads correctly

## Testing

To test locally before deploying:
1. Set `NODE_ENV=production` in your local `.env` file
2. Start the server
3. Visit `http://localhost:3000`
4. Try logging in
5. Check browser DevTools → Application → Cookies to verify cookies are being set

To test in production:
1. Deploy the updated code
2. Visit `https://abcoafrica.co.za`
3. Try logging in
4. Check browser DevTools → Application → Cookies
5. Verify `refreshToken` cookie is present with `Secure` flag set

## Related Files Changed
- ✅ `api/_lib/withHttp.js` - Added CORS origins
- ✅ `api/auth/login.js` - Fixed cookie Secure flag
- ✅ `api/auth/refresh.js` - Fixed cookie Secure flag
- ✅ `api/auth/logout.js` - Fixed cookie Secure flag

## Expected Behavior After Fix

### Login Flow
1. User submits login credentials
2. Server validates credentials
3. Server generates access token and refresh token
4. Server sets `refreshToken` cookie with Secure flag (in production)
5. Server returns access token in response
6. Client stores access token in localStorage
7. Client redirects to dashboard

### Refresh Flow
1. Client makes request with expired access token
2. Client receives 401 response
3. Client calls `/api/auth/refresh` (with refreshToken cookie)
4. Server validates refresh token
5. Server generates new access token
6. Server returns new access token
7. Client uses new access token

### Logout Flow
1. User clicks logout
2. Client calls `/api/auth/logout`
3. Server clears refreshToken cookie
4. Client clears access token from localStorage
5. Client redirects to login page

## Status
✅ **Code fixes completed**
⏳ **Awaiting deployment and testing**

