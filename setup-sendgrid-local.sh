#!/bin/bash
# Setup SendGrid for local development
# Usage: ./setup-sendgrid-local.sh YOUR_SENDGRID_API_KEY [your-verified-email@domain.com]

if [ -z "$1" ]; then
    echo "❌ Error: SendGrid API key required"
    echo ""
    echo "Usage: ./setup-sendgrid-local.sh YOUR_SENDGRID_API_KEY [your-verified-email@domain.com]"
    echo ""
    echo "Example: ./setup-sendgrid-local.sh SG.xxxxxxxxxxxxx garethm@abcotronics.co.za"
    echo ""
    echo "To get your API key:"
    echo "1. Go to https://app.sendgrid.com/"
    echo "2. Navigate to Settings → API Keys"
    echo "3. Create a new key with 'Mail Send' permissions"
    echo "4. Copy the API key (starts with SG.)"
    exit 1
fi

SENDGRID_API_KEY="$1"
EMAIL_FROM="${2:-garethm@abcotronics.co.za}"

echo "📧 Setting up SendGrid for local development..."
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating it..."
    touch .env
fi

# Update SMTP_HOST
if grep -q "^SMTP_HOST=" .env; then
    sed -i '' "s|^SMTP_HOST=.*|SMTP_HOST=smtp.sendgrid.net|" .env
else
    echo "SMTP_HOST=smtp.sendgrid.net" >> .env
fi

# Update SMTP_PORT
if grep -q "^SMTP_PORT=" .env; then
    sed -i '' "s|^SMTP_PORT=.*|SMTP_PORT=587|" .env
else
    echo "SMTP_PORT=587" >> .env
fi

# Update SMTP_USER (must be 'apikey' for SendGrid)
if grep -q "^SMTP_USER=" .env; then
    sed -i '' "s|^SMTP_USER=.*|SMTP_USER=apikey|" .env
else
    echo "SMTP_USER=apikey" >> .env
fi

# Update SMTP_PASS with API key
if grep -q "^SMTP_PASS=" .env; then
    sed -i '' "s|^SMTP_PASS=.*|SMTP_PASS=$SENDGRID_API_KEY|" .env
else
    echo "SMTP_PASS=$SENDGRID_API_KEY" >> .env
fi

# Set SENDGRID_API_KEY (explicit variable)
if grep -q "^SENDGRID_API_KEY=" .env; then
    sed -i '' "s|^SENDGRID_API_KEY=.*|SENDGRID_API_KEY=$SENDGRID_API_KEY|" .env
else
    echo "SENDGRID_API_KEY=$SENDGRID_API_KEY" >> .env
fi

# Update EMAIL_FROM
if grep -q "^EMAIL_FROM=" .env; then
    sed -i '' "s|^EMAIL_FROM=.*|EMAIL_FROM=$EMAIL_FROM|" .env
else
    echo "EMAIL_FROM=$EMAIL_FROM" >> .env
fi

echo ""
echo "✅ SendGrid configuration updated in .env file:"
echo ""
grep -E "^(SMTP_HOST|SMTP_PORT|SMTP_USER|SENDGRID_API_KEY|EMAIL_FROM)=" .env | sed 's/SMTP_PASS=.*/SMTP_PASS=***HIDDEN***/' | sed 's/SENDGRID_API_KEY=.*/SENDGRID_API_KEY=***HIDDEN***/' || echo "   (Config not found)"
echo ""
echo "📧 Next steps:"
echo "   1. Make sure your EMAIL_FROM address ($EMAIL_FROM) is verified in SendGrid"
echo "   2. Restart your server (npm run dev or your usual command)"
echo "   3. Test feedback emails by submitting feedback in the app"
echo ""
echo "🧪 You can also test with:"
echo "   node test-feedback-email.js"
echo ""

