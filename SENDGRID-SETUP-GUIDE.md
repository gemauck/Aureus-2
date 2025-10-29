# SendGrid Setup Guide - Step by Step

## Step 1: Get Your SendGrid API Key

1. **Log into SendGrid**: https://app.sendgrid.com/

2. **Navigate to API Keys**:
   - Click on **Settings** (gear icon in left sidebar)
   - Click on **API Keys** in the dropdown menu

3. **Create API Key**:
   - Click **"Create API Key"** button
   - Choose **"Full Access"** (or "Restricted Access" with "Mail Send" permission)
   - Give it a name: "Abcotronics ERP Production"
   - Click **"Create & View"**
   - **IMPORTANT**: Copy the API key immediately - you won't be able to see it again!
   - It will look like: `SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

## Step 2: Verify Your Sender Email (Recommended)

1. **Navigate to Settings → Sender Authentication**

2. **Single Sender Verification** (Quick for testing):
   - Click "Verify a Single Sender"
   - Enter your email (e.g., `noreply@abcotronics.co.za` or `garethm@abcotronics.co.za`)
   - Click "Create"
   - Check your email and verify it

   OR

3. **Domain Authentication** (Better for production):
   - Click "Authenticate Your Domain"
   - Enter your domain: `abcotronics.co.za` or `abcoafrica.co.za`
   - Follow the DNS instructions
   - Add the DNS records to your domain registrar

## Step 3: Run the Setup Script

Once you have your API key, run:

```bash
./switch-to-sendgrid.sh SG.your-actual-api-key-here
```

Replace `SG.your-actual-api-key-here` with your actual API key from Step 1.

## Step 4: Test It

After running the script, test the email:

```bash
curl -X POST https://abcoafrica.co.za/api/test-email \
  -H "Content-Type: application/json" \
  -d '{"email":"gemauck@gmail.com","name":"Test from SendGrid","role":"user"}'
```

## Troubleshooting

### If you get "authentication failed":
- Double-check your API key (must start with `SG.`)
- Make sure you copied the entire key (they're quite long)

### If emails don't arrive:
- Check your SendGrid Activity Feed: https://app.sendgrid.com/activity
- Check spam folder
- Make sure your sender email is verified

### Still need help?
Share your API key and I can set it up for you!

