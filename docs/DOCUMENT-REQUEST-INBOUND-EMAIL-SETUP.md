# Document Request Reply-by-Email Setup

When recipients **reply** to a "Request documents via email" message with attachments, those files are uploaded to the **latest comment** for that document/month in the checklist. This requires Resend **inbound** and a **webhook**.

---

## 1. Environment variables

Add to your `.env` (or `.env.local` / production env):

```bash
# Inbound address where replies to document-request emails are received (Resend inbound).
# Must be an address that Resend receives (see step 2). Ours: documents@abcoafrica.co.za
DOCUMENT_REQUEST_INBOUND_EMAIL=documents@abcoafrica.co.za

# Resend API key (you likely already have this for sending).
# Same key is used by the webhook to fetch received email and attachments.
RESEND_API_KEY=re_xxxxxxxxxxxx

# Resend webhook signing secret (from webhook details in Resend dashboard).
# When set, only requests with a valid Svix signature are accepted.
RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
```

- **DOCUMENT_REQUEST_INBOUND_EMAIL**  
  Use the exact inbound address you configure in Resend. Ours: `documents@abcoafrica.co.za`.  
  Alternative env name: `INBOUND_EMAIL_FOR_DOCUMENT_REQUESTS`.

- **RESEND_API_KEY**  
  Required for both sending and for the webhook to call Resend’s “retrieve received email” and “list attachments” APIs.

---

## 2. Resend: Inbound address

1. Log in to [Resend](https://resend.com) → **Receiving** (or **Domains**).
2. Add or use a **domain** that Resend can receive mail for (e.g. `yourdomain.com`).
3. Configure **inbound** so that mail to a specific address (e.g. `documents@abcoafrica.co.za`) is received by Resend.  
   - Resend’s docs: [Receiving – Introduction](https://resend.com/docs/dashboard/receiving/introduction), [Custom Domains](https://resend.com/docs/dashboard/receiving/custom-domains).
4. Set **DOCUMENT_REQUEST_INBOUND_EMAIL** (or **INBOUND_EMAIL_FOR_DOCUMENT_REQUESTS**) to that **exact** address.

---

## 3. Resend: Webhook for `email.received`

1. In Resend go to **Webhooks** (or **Settings** → **Webhooks**).
2. **Add webhook**.
3. **Endpoint URL** (use your live app URL):
   ```text
   https://YOUR_APP_DOMAIN/api/inbound/document-request-reply
   ```
   Example: `https://app.abcotronics.co.za/api/inbound/document-request-reply`
4. **Events**: select **`email.received`** (and any others you want; only `email.received` is used for document-request replies).
5. Save. Resend will POST to this URL when an email is received at your inbound address.

Optional: enable **webhook signing** in Resend and verify the signature in the handler (see [Verify Webhooks](https://resend.com/docs/webhooks/verify-webhooks-requests)).

---

## Troubleshooting: Replies not showing in comments

- The app stores a **custom Message-ID** when you send a document request (so reply `In-Reply-To` can be matched). **After any deploy that changes this flow, send a new document request from the app** and reply to that email; replies to requests sent before the change may not match.
- If replies still don’t show: check server logs (`pm2 logs abcotronics-erp`) for `document-request-reply:` messages. You’ll see either `no In-Reply-To`, `unknown_thread` (no matching sent request), or `matched thread` + comment created.
- Ensure the webhook URL is correct and Resend can reach it (no firewall blocking). If you use **RESEND_WEBHOOK_SECRET**, the secret in Resend must match.

---

## 4. Checklist

- [ ] **DB**: Table `DocumentRequestEmailSent` exists (already applied via `npx prisma db push` or migration).
- [ ] **Env**: `DOCUMENT_REQUEST_INBOUND_EMAIL` set to your Resend inbound address.
- [ ] **Env**: `RESEND_API_KEY` set (same key used for sending).
- [ ] **Resend**: Inbound configured so replies to the document-request address are received by Resend.
- [ ] **Resend**: Webhook added with URL `https://YOUR_APP_DOMAIN/api/inbound/document-request-reply` and event `email.received`.

After this, when a recipient replies to a document-request email (to the inbound address) with attachments, the app will store the files under `uploads/doc-collection-comments/` and add them to the latest comment for that project/section/document/month (or create a new comment).
