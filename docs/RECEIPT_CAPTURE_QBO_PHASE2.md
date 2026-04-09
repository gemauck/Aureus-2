# Receipt capture — QuickBooks Online integration (phase 2)

The Staff Tools **Receipt capture** MVP stores slips in the ERP, extracts fields with OpenAI, and exports **CSV** for manual import into QuickBooks or spreadsheets.

## Future: push to QuickBooks Online (QBO)

This is **not** implemented yet. The HR **QuickBooks Payroll Sync** UI uses **mock OAuth**; there is no shared Intuit token service in `api/` today.

### Recommended approach

1. **OAuth 2.0 (server-side)**  
   - Register an Intuit app, store `INTUIT_CLIENT_ID`, `INTUIT_CLIENT_SECRET`, redirect URI on the ERP host.  
   - Persist `access_token`, `refresh_token`, `realmId` per company in the database (encrypted at rest).  
   - Refresh tokens before expiry (Intuit refresh flow).

2. **Map ERP rows to QBO entities**  
   - **Expense** or **Purchase** with `AccountRef` / `DepartmentRef` or **Class** (depending on whether you map “cost centres” to QBO classes or departments).  
   - Attach the source file using **Attachable** linked to the transaction.

3. **Chart of accounts**  
   - Either continue using ERP-defined `ReceiptAccount` codes and map once to QBO `Account.Id`, or pull QBO accounts via `query` and let users pick in the UI.

4. **Security**  
   - Restrict connect/disconnect to admins; audit log financial sync actions.

### References

- [Intuit QuickBooks Online API](https://developer.intuit.com/app/developer/qbo/docs/get-started)  
- Existing placeholder UI: `src/components/hr/QuickBooksPayrollSync.jsx` (replace mock flow with real OAuth + API calls when implementing).
