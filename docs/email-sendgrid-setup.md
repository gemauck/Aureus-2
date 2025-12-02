# Email Delivery Setup (SendGrid)

Use this guide to configure the SendGrid API key and verify that transactional emails work in both local development and on the Droplet.

## 1. Prepare your environment variables

1. Copy `docs/env.template` to the appropriate file:
   - Local development: `cp docs/env.template .env.local`
   - Production server: `cp docs/env.template .env`
2. Fill in the placeholders for at least the following keys:
   - `SENDGRID_API_KEY`
   - `EMAIL_FROM` (must be a verified sender in SendGrid)
   - `EMAIL_REPLY_TO` (optional, defaults to garethm@abcotronics.co.za)
   - `APP_URL`
   - `JWT_SECRET`, `DATABASE_URL`, and any other required secrets
3. Keep the filled-in file private. Do **not** commit it to Git.

## 2. Deploying with secrets

The `deploy-to-droplet.sh` script now syncs common secrets into the remote `.env`. Before you run it, export your secrets in the shell that launches the script:

```bash
export DATABASE_URL="postgresql://..."
export JWT_SECRET="$(openssl rand -hex 32)"
export SENDGRID_API_KEY="SG.xxxxxx"
export EMAIL_FROM="Abcotronics <no-reply@yourdomain.com>"
export EMAIL_REPLY_TO="support@yourdomain.com"
# add any additional SMTP_* variables if needed

./deploy-to-droplet.sh
```

During deployment the script will:

- create `.env` on the droplet if missing
- merge in the exported variables (without overwriting unspecified entries)
- warn you if `DATABASE_URL`, `JWT_SECRET`, or `SENDGRID_API_KEY` are missing
- restart the PM2 process with the updated environment

## 3. Verifying email delivery

Once the server is running (or in local dev), run the SendGrid smoke test:

```bash
node -r dotenv/config send-test-email.js you@example.com
```

Notes:

- You can omit the recipient to fall back to `process.env.TEST_EMAIL` or `gemauck@gmail.com`.
- The script exits early if no SendGrid or SMTP credentials are available.
- Success output includes the message ID and points you to the SendGrid activity log.

If the script fails:

- Double-check that the sender address is verified in SendGrid.
- Confirm that the `SENDGRID_API_KEY` environment variable is present (run `echo $SENDGRID_API_KEY` on the server).
- Review the console output for specific SendGrid API errors.

## 4. Troubleshooting tips

- **403 or 401 from SendGrid**: the API key is invalid or lacks the “Mail Send” permission. Create a new Restricted API key with “Mail Send” enabled.
- **“Sender not verified”**: finish sender authentication in the SendGrid dashboard (`Settings → Sender Authentication`).
- **No logs in SendGrid**: the app likely used SMTP instead of the HTTP API; make sure `SENDGRID_API_KEY` is set so the HTTP path is taken.
- **Still using Gmail SMTP?**: remove any leftover `SMTP_USER`/`SMTP_PASS` values or ensure `SENDGRID_API_KEY` takes precedence.

With these steps in place you can rotate secrets safely, redeploy with confidence, and confirm that transactional emails are functioning.










