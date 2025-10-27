# Security Features Quick Reference

## 🚨 CRITICAL: First Steps

### 1. Secure Your Gmail App Password (DO THIS NOW!)

**Your exposed password needs to be revoked immediately:**

1. Go to: https://myaccount.google.com/apppasswords
2. Delete the exposed app password
3. Generate a new one:
   - Select app: "Mail"
   - Select device: "Other" → Type "Abcotronics ERP"
   - Click Generate
   - Copy the 16-character password
4. Update `.env` file with new password (remove spaces)

### 2. Generate Secure JWT Secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and update `JWT_SECRET` in `.env`

---

## 📦 Installation

```bash
# Install dependencies
npm install jsonwebtoken speakeasy qrcode express-rate-limit helmet node-cron

# Update database schema
npx prisma migrate dev --name session_security

# Verify setup
node verify-security-setup.js
```

---

## 🔑 Features Overview

### 1. Session Management
**What it does:** Tracks all devices/browsers where user is logged in

**User can:**
- View all active sessions
- See device type, location (IP), and last active time
- Revoke individual sessions
- Logout from all other devices at once

**Admin benefits:**
- Track user activity across devices
- Identify suspicious login patterns
- Force logout compromised accounts

### 2. Two-Factor Authentication (2FA)
**What it does:** Adds extra security layer requiring phone/app code

**Setup process:**
1. User enables 2FA in settings
2. Scans QR code with authenticator app
3. Enters 6-digit code to verify
4. Receives 10 backup codes

**Login with 2FA:**
1. Enter email/password
2. Enter 6-digit code from app (or backup code)
3. Access granted

**Compatible apps:**
- Google Authenticator
- Microsoft Authenticator
- Authy
- 1Password
- Any TOTP-compatible app

### 3. Account Protection
**What it does:** Prevents brute-force attacks and password reuse

**Features:**
- Locks account after 5 failed login attempts
- 30-minute automatic lockout (or reset password)
- Prevents reusing last 5 passwords
- Email alerts for suspicious activity

### 4. Security Monitoring
**What it does:** Tracks all security-related events

**Events logged:**
- Login attempts (success/failed)
- 2FA verification attempts
- Password changes
- Session revocations
- Suspicious location logins
- Account lockouts

### 5. Security Dashboard
**What it does:** Shows security status at a glance

**Displays:**
- Active sessions count
- Recent security events (7 days)
- Failed login attempts (24 hours)
- 2FA status
- Security recommendations

---

## 📝 API Endpoints Reference

### Authentication
```
POST /api/auth/login                    - Login with session creation
POST /api/auth/logout                   - Logout (revoke current session)
```

### Session Management
```
GET  /api/sessions/user/:userId         - Get all user sessions
POST /api/sessions/:sessionId/revoke    - Revoke specific session
POST /api/sessions/revoke-all-others    - Revoke all except current
```

### Two-Factor Authentication
```
POST /api/auth/2fa/enable               - Start 2FA setup (get QR code)
POST /api/auth/2fa/verify-setup         - Verify code and enable 2FA
POST /api/auth/2fa/verify               - Verify 2FA during login
POST /api/auth/2fa/disable              - Disable 2FA (requires password)
```

### Security Monitoring
```
GET  /api/security/events/:userId       - Get security events
GET  /api/security/overview/:userId     - Get security dashboard data
```

### Password Management
```
POST /api/security/check-password-history          - Check if password was used
POST /api/security/update-password-with-history    - Update with history check
```

---

## 🧪 Testing Checklist

### Test Login Flow
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","rememberMe":false}'
```

### Test Session Management
```bash
# Get sessions
curl http://localhost:3000/api/sessions/user/USER_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test Account Lockout
Try 5 failed login attempts and verify account locks

### Test 2FA Setup
1. Enable 2FA through UI
2. Verify QR code displays
3. Verify code with authenticator app
4. Verify backup codes are shown
5. Test login with 2FA

### Test Security Events
1. Perform various actions (login, logout, etc.)
2. Check events are logged
3. Verify email alerts are sent

---

## 🔒 Security Best Practices

### For Development
- ✅ Use `.env` for all secrets
- ✅ Never commit `.env` to git
- ✅ Use strong JWT secret (32+ chars)
- ✅ Test on localhost first

### For Production
- ✅ Use HTTPS only
- ✅ Enable rate limiting
- ✅ Use strong passwords
- ✅ Enable helmet middleware
- ✅ Set secure cookie flags
- ✅ Regular security audits
- ✅ Monitor logs for suspicious activity
- ✅ Keep dependencies updated

### For Users
- ✅ Enable 2FA on all accounts
- ✅ Use strong, unique passwords
- ✅ Review active sessions regularly
- ✅ Revoke unknown sessions immediately
- ✅ Save backup codes securely
- ✅ Report suspicious activity

---

## 🐛 Troubleshooting

### Email not sending
1. Check SMTP credentials in `.env`
2. Verify app password is correct (no spaces)
3. Check Gmail "Less secure app access" settings
4. Test with verification script

### Sessions not working
1. Check JWT_SECRET is set
2. Verify database migration ran
3. Check Session table exists
4. Review server logs for errors

### 2FA not working
1. Verify `speakeasy` and `qrcode` are installed
2. Check time sync on server/phone
3. Try backup codes
4. Regenerate QR code

### Account locked
- Wait 30 minutes, OR
- Use password reset link

---

## 📞 Support Commands

### Check environment variables
```bash
cat .env | grep -E "(JWT|SMTP|SESSION)"
```

### Verify database schema
```bash
npx prisma studio
```

### Check installed packages
```bash
npm list | grep -E "(jwt|speakeasy|qrcode|helmet)"
```

### View server logs
```bash
# If using pm2
pm2 logs

# If using npm run dev
# Check console output
```

### Clean expired sessions (manual)
```bash
npx prisma studio
# Go to Session table
# Delete records where expiresAt < current date
```

---

## 🚀 Quick Start Workflow

1. **Setup (one-time)**
   ```bash
   # Install dependencies
   npm install jsonwebtoken speakeasy qrcode express-rate-limit helmet
   
   # Update .env with secure values
   # Run migration
   npx prisma migrate dev
   
   # Verify
   node verify-security-setup.js
   ```

2. **Start Server**
   ```bash
   npm run dev
   ```

3. **Test Features**
   - Login to system
   - Go to Settings → Security
   - Enable 2FA
   - View active sessions
   - Review security events

4. **For Each User**
   - Encourage 2FA adoption
   - Review sessions regularly
   - Monitor security dashboard
   - Report suspicious activity

---

## 📚 Additional Resources

- [Google Authenticator Setup](https://support.google.com/accounts/answer/1066447)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)

---

**Remember: Security is an ongoing process, not a one-time setup!**
