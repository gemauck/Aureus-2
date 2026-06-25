# Stock-Take — Field Test Checklist

Run on a technician device (Expo RN build). One pass **online**, one pass **offline** (airplane mode after setup).

## Pre-flight (production — verified 2026-06-25)

- [x] Web deploy build `1782414651867` live at https://abcoafrica.co.za
- [x] Mobile OTA bundles published for `erp-mobile-1` … `erp-mobile-4` (restart app to pick up)
- [x] Public inventory/locations APIs respond with field client header
- [ ] Full module UI smoke (Dashboard → Clients → Projects → Manufacturing) — needs `TEST_EMAIL` / `TEST_PASSWORD` in `.env.local`, then `npm run smoke:production:ui`

Automated checks (no device): `APP_URL=https://abcoafrica.co.za npm run smoke:production`

## Setup

- [ ] App updated (OTA or fresh install)
- [ ] Logged in with a user who can access job cards / stock take
- [ ] At least one warehouse location with known SKUs in ERP

## Online flow

1. [ ] Open **Job cards (native)** → **Stock-Take**
2. [ ] Select warehouse → list loads (spinner then rows)
3. [ ] Search filter narrows SKUs
4. [ ] **Scan barcode / QR** → list filters to scanned SKU; row highlighted
5. [ ] Tap “show all” clears scan filter
6. [ ] Enter counts on 3+ lines
7. [ ] **Save draft** → “Stock-take draft saved”
8. [ ] Leave screen and return → counts restored from local draft
9. [ ] **Submit for review** → success; returns to landing

## Offline flow

1. [ ] While **online**, open stock take and select warehouse (warms cache)
2. [ ] Enable airplane mode → **Offline** banner visible
3. [ ] Cached list banner: “Showing cached stock list…”
4. [ ] Enter counts → **Save draft** → saved on device message
5. [ ] **Submit for review** → queued offline message
6. [ ] Disable airplane mode → pending sync runs (check landing / sync indicator)
7. [ ] Confirm submission in web ERP stock-take review queue

## Failure cases

- [ ] Submit with no counts → blocked with alert
- [ ] Submit without location → blocked
- [ ] Scan unknown code → “Unrecognized scan” or “Not in list”
- [ ] Load error → **Retry** reloads list

## Sign-off

| Tester | Date | Device | Pass / Fail | Notes |
|--------|------|--------|-------------|-------|
|        |      |        |             |       |
