# Receipt capture — QuickBooks Online integration

Staff Tools **Expense Capture** stores slips in the ERP, extracts fields with OpenAI, allocates to accounts/cost centres, and can **push to QuickBooks Online** or **export CSV**.

## Setup (server)

1. Create an app at [Intuit Developer](https://developer.intuit.com/) with **QuickBooks Online Accounting** scope.
2. Add redirect URI: `https://<your-host>/api/quickbooks/oauth-callback` (or set `INTUIT_REDIRECT_URI`).
3. Set environment variables on the ERP host:

| Variable | Purpose |
|----------|---------|
| `INTUIT_CLIENT_ID` | OAuth client id |
| `INTUIT_CLIENT_SECRET` | OAuth client secret |
| `INTUIT_REDIRECT_URI` | Optional override for callback URL |
| `INTUIT_ENV` | `sandbox` or `production` (default production) |

4. Apply database migration (adds `QuickBooksConnection`, QBO fields on receipt tables):

```bash
npx prisma migrate deploy
# or during dev:
npx prisma migrate dev --name quickbooks_receipt_sync
```

## Admin workflow (web or mobile)

1. **Tools → Expense Capture → Setup**
2. **Connect QuickBooks** (OAuth in browser; web opens popup, mobile opens system browser).
3. Select **payment account** (bank/credit card — source of cash expenses in QBO).
4. Map each ERP **account** → QBO **expense account**.
5. Map each ERP **cost centre** → QBO **class** (optional).
6. Staff capture receipts, allocate, mark **reviewed**.
7. Admin **Push to QuickBooks** (or **Push QBO** in app header).

Pushed rows become QBO **Purchase** (Cash) transactions with receipt **attachments** when upload succeeds. Status becomes `exported`; `qboPurchaseId` is stored on the document.

## API

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/quickbooks/connection` | Connection status |
| GET | `/api/quickbooks/auth-url` | Start OAuth (admin) |
| GET | `/api/quickbooks/oauth-callback` | Intuit redirect (no JWT) |
| PATCH | `/api/quickbooks/connection` | Set `defaultPaymentAccountId` |
| DELETE | `/api/quickbooks/connection` | Disconnect |
| GET | `/api/quickbooks/accounts` | QBO expense accounts |
| GET | `/api/quickbooks/payment-accounts` | QBO bank/credit accounts |
| GET | `/api/quickbooks/classes` | QBO classes |
| POST | `/api/receipt-documents/push-qbo` | Body: `{ documentIds: [] }` or `{ allReviewed: true }` |

Connect/disconnect and push are **admin only** and write to **Audit Trail** (`entity: quickbooks`).

## CSV export

Still available for manual import or backup. Includes account/cost-centre codes and source file URLs.

## Troubleshooting

- **503 QBO_NOT_CONFIGURED** — missing `INTUIT_CLIENT_ID` / `INTUIT_CLIENT_SECRET`.
- **Push failed: not mapped** — assign ERP account and map to QBO expense account in Setup.
- **Payment account** — required before push; select bank/card account in Setup.
- **Attachment warning** — expense is created in QBO; receipt attach may fail on large/PDF files (see `qboSyncError` on document).
