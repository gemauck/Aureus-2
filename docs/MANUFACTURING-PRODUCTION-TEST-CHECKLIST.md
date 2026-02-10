# Manufacturing – Production Test Checklist

Use this after deploying to **https://abcoafrica.co.za** to verify functionality, UI, and persistence.

## Automated test (with credentials)

```bash
TEST_URL=https://abcoafrica.co.za TEST_EMAIL=your@email.com TEST_PASSWORD=yourpassword node scripts/test-manufacturing-production-full.js
# or
npm run test:manufacturing:production:full
```

This runs: **Functionality** (API: locations, inventory one-per-SKU, movements, transfer validation), **UI** (Manufacturing page, Inventory tab, Record Movement From/To dropdowns), **Persistence** (create movement, re-fetch count and by ID).

---

## Manual checklist

### 1. Functionality

- [ ] **Inventory list**
  - One row per SKU (no duplicate SKU rows).
  - Location column shows “Multiple locations” or a single location name.
  - Location filter dropdown works (e.g. “All locations”, then a specific location).
- [ ] **Open an inventory item**
  - Location dropdown in detail view.
  - Ledger shows entries for the **selected location** only.
  - “All locations” table shows all locations for that SKU.
  - “Transfer between locations” opens Record Movement with type **Transfer**.
- [ ] **Record Stock Movement**
  - **From** and **To** are **dropdowns** (stock locations), not free text.
  - **Transfer**: both From and To required, and must be different.
  - **Receipt / Production**: To required; **Consumption**: From required.
  - Success: movement appears in list and in item ledger.
  - **Validation**: e.g. transfer with insufficient stock at source → **one** clear alert (e.g. “Insufficient stock at source location”), no repeated retries or 500.
- [ ] **Other tabs**
  - Stock Movements list loads and shows movements with location info.
  - BOMs, Production Orders, Sales Orders, Purchase Orders, Suppliers, Stock Locations load as expected.

### 2. UI

- [ ] Layout and labels correct; no duplicate SKU rows in inventory list.
- [ ] Location column and detail location selector work.
- [ ] Record Movement modal: From/To are dropdowns; validation errors show as a single alert.

### 3. Persistence

- [ ] Record a **receipt** or **transfer** (small quantity).
- [ ] Refresh the page or navigate away and back to Manufacturing.
- [ ] Confirm the new movement appears in Stock Movements and in the item’s ledger; quantities and locations are correct.

---

## Notes

- If automated run is done **without** `TEST_EMAIL` and `TEST_PASSWORD`, login and all dependent checks are skipped (no failures).
- Production URL is set via `TEST_URL` (default: `https://abcoafrica.co.za`).
