# Login Issue Diagnosis - garethm@abcotronics.co.za

## Issue Summary
Login attempts are failing with "Invalid credentials" (401 error).

## Root Cause
**The password being entered does not match the stored password hash in the database.**

## Diagnostic Results
Based on server logs analysis:

✅ **User exists in database**
- Email: `garethm@abcotronics.co.za`
- Name: Gareth Mauck
- User ID: `cmhnbrl8v00006z8vlbdb2amy`
- Account status: `active`
- Password hash: Valid (60 characters, bcrypt format)

❌ **Password verification fails**
- Password hash format: Valid (`$2a$10$...`)
- Password comparison result: `false`
- Error: `Invalid password - check: password hash format, password encoding, or password mismatch`

## Solutions

### Option 1: Use Password Reset Feature (Recommended)
If the application has a password reset feature:
1. Click "Forgot Password" on the login page
2. Enter email: `garethm@abcotronics.co.za`
3. Check email for reset link
4. Follow instructions to set a new password

### Option 2: Reset Password via Server Script
1. SSH into the server:
   ```bash
   ssh root@abcoafrica.co.za
   ```

2. Navigate to the application directory:
   ```bash
   cd /var/www/abcotronics-erp
   ```

3. Run the password reset script:
   ```bash
   # Set a new password (replace 'NewPassword123!' with your desired password)
   node reset-user-password-server.js 'NewPassword123!'
   ```

   Or use the default temporary password:
   ```bash
   node reset-user-password-server.js
   ```
   (Default password: `Abcotronics2024!`)

4. Login with the new password

### Option 3: Check for Orphaned Token
The console logs show an orphaned token issue:
```
⚠️ Token exists but no user data, clearing orphaned token
⚠️ User not found in database - clearing orphaned token
```

This suggests there was an old token for a user ID that no longer exists (`cmhbumrg60000p11dzn5oki41`). This has been automatically cleared.

**Solution:** Clear browser storage and try logging in again:
1. Open browser developer tools (F12)
2. Go to Application/Storage tab
3. Clear all site data (Local Storage, Session Storage, Cookies)
4. Refresh the page and try logging in again

## Server Logs Reference
Recent login attempt logs show:
```
🔐 Login attempt started
✅ Email and password validated
✅ User found: true
🔑 Verifying password
❌ Password comparison result: valid: false
❌ Invalid password - password mismatch
```

## Verification
After resetting the password, verify the login works:
1. Clear browser cache and storage
2. Navigate to login page
3. Enter email: `garethm@abcotronics.co.za`
4. Enter the new password
5. Should see successful login

## Prevention
To avoid this in the future:
- Use the password reset feature when passwords are forgotten
- Store passwords securely (password manager)
- Use strong, unique passwords
- Enable two-factor authentication if available

## Related Files
- `api/auth/login.js` - Login endpoint with detailed logging
- `reset-user-password-server.js` - Password reset script
- `check-and-fix-user.js` - User diagnostic script

