# Gmail App Password Setup Guide

## Why Gmail App Passwords are Required

Gmail accounts require special authentication for third-party applications to send emails. Regular passwords won't work for SMTP - you need an "App Password".

## Step-by-Step Setup

### Step 1: Enable 2-Factor Authentication
1. Go to your Gmail account: https://gmail.com
2. Click your profile picture → "Manage your Google Account"
3. Go to "Security" tab
4. Under "Signing in to Google", enable "2-Step Verification" if not already enabled
5. Follow the setup process (usually requires phone number)

### Step 2: Generate App Password
1. In the same Security section, look for "App passwords" (under 2-Step Verification)
2. If you don't see it, make sure 2-Step Verification is enabled first
3. Click "App passwords"
4. Select "Mail" from the dropdown
5. Select "Other (custom name)" and type "Abcotronics ERP"
6. Click "Generate"
7. **Copy the 16-character password** (it looks like: abcd efgh ijkl mnop)

### Step 3: Update the Code
1. Replace `YOUR_APP_PASSWORD_HERE` in the email configuration with your 16-character app password
2. The password should NOT have spaces (remove them if present)

### Step 4: Test the Email
1. Use the email test tool: `/email-test.html`
2. Try sending a test invitation
3. Check the console logs for any errors

## Alternative: Use Hostinger SMTP

If Gmail App Passwords don't work, you can use Hostinger SMTP instead:

```javascript
const transporter = nodemailer.createTransporter({
    host: 'smtp.hostinger.com',
    port: 465,
    secure: true,
    auth: {
        user: 'garethm@abcotronics.co.za',
        pass: 'GazMauck1989*'
    }
});
```

## Troubleshooting

### Common Issues:
1. **"Invalid credentials"** - Make sure you're using the App Password, not your regular Gmail password
2. **"Less secure app access"** - This is deprecated, use App Passwords instead
3. **"2-Step Verification required"** - Enable 2FA first, then generate App Password

### Security Note:
- App Passwords are specific to this application
- You can revoke them anytime from Google Account settings
- They're more secure than regular passwords

## Testing

After setup, test with:
- Email test tool: `/email-test.html`
- User Management → Send Invitation
- Check spam folder for test emails

## Need Help?

If you're still having issues:
1. Check Railway deployment logs for email errors
2. Try the email test tool for detailed error messages
3. Verify the App Password is correct (16 characters, no spaces)
