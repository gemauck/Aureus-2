# Security Setup Instructions

## ⚠️ IMMEDIATE ACTION REQUIRED

Your Gmail app password was exposed. Follow these steps NOW:

### 1. Revoke Exposed App Password
1. Go to: https://myaccount.google.com/apppasswords
2. Sign in with your Google account
3. Find the app password you created
4. Click "Remove" or "Revoke"

### 2. Generate New App Password
1. Still at https://myaccount.google.com/apppasswords
2. Click "Select app" → Choose "Mail"
3. Click "Select device" → Choose "Other (Custom name)"
4. Type: "Abcotronics ERP"
5. Click "Generate"
6. Copy the 16-character password (it will look like: "xxxx xxxx xxxx xxxx")

### 3. Update Your .env File
1. Open: `/Users/gemau/Documents/Project ERP/abcotronics-erp-modular/.env`
2. Replace `YOUR_NEW_APP_PASSWORD_HERE` with the new password
3. Remove spaces from the password (make it one continuous string)
4. Save the file

Example:
```env
SMTP_PASS="abcdabcdabcdabcd"  # No spaces
```

### 4. Generate Secure JWT Secret

Run this command to generate a secure random JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and replace `your-super-secret-jwt-key-change-this-in-production` in your .env file.

### 5. Install Required Dependencies

```bash
cd "/Users/gemau/Documents/Project ERP/abcotronics-erp-modular"
npm install jsonwebtoken speakeasy qrcode express-rate-limit helmet node-cron
```

### 6. Update Prisma Schema

The schema has already been prepared. Run the migration:

```bash
npx prisma migrate dev --name session_management_security
```

### 7. Verify Setup

Create a test file to verify email configuration:

```bash
node -e "
const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransporter({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

transporter.verify().then(() => {
    console.log('✅ Email configuration is working!');
}).catch((error) => {
    console.error('❌ Email configuration error:', error);
});
"
```

## 🔒 Security Checklist

- [ ] Revoked exposed Gmail app password
- [ ] Generated new Gmail app password
- [ ] Updated SMTP_PASS in .env file
- [ ] Generated secure JWT_SECRET
- [ ] Updated JWT_SECRET in .env file
- [ ] Installed all dependencies
- [ ] Ran Prisma migration
- [ ] Verified email configuration
- [ ] Added .env to .gitignore (if not already)
- [ ] Never share .env file or passwords again

## 📝 .gitignore Check

Make sure your .gitignore includes:

```
.env
.env.local
.env.production
*.env
```

Run this to check:
```bash
cat .gitignore | grep -i env
```

If it's not there, add it:
```bash
echo ".env" >> .gitignore
echo ".env.*" >> .gitignore
```

## 🚀 Next Steps

After completing all security steps above:

1. Restart your server
2. Test the login functionality
3. Set up 2FA on your account
4. Review active sessions
5. Check security logs

## 📞 Support

If you encounter any issues:
1. Check the console for error messages
2. Verify all environment variables are set
3. Ensure dependencies are installed
4. Check Prisma migration status

---

**REMEMBER:** Never share passwords, API keys, or .env files with anyone, including in conversations or screenshots.
