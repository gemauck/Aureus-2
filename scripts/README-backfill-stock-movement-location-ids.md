# Backfill StockMovement location IDs

Updates existing `StockMovement` records so `fromLocation` and `toLocation` store **location IDs** instead of location codes. This makes the inventory detail "ledger by location" filter show all historical movements.

## Why

- New movements are stored with location IDs (best practice).
- Older movements may have been stored with codes (e.g. `"PMB"`, `"LOC001"`).
- The detail view filters the ledger by `selectedDetailLocationId` (an ID), so rows that still have a code in `fromLocation`/`toLocation` don’t match and are hidden.

## Usage

1. **Dry run** (no DB changes; only reports what would be updated):

   ```bash
   node scripts/backfill-stock-movement-location-ids.js
   ```

2. **Apply updates** (requires `DATABASE_URL` in `.env` or environment):

   ```bash
   node scripts/backfill-stock-movement-location-ids.js --write
   ```

## What it does

- Loads all `StockLocation` (id, code) and builds code → id lookup.
- Loads all `StockMovement` (id, fromLocation, toLocation).
- For each movement: if `fromLocation` or `toLocation` is a known **code**, replaces it with the corresponding location **id**; if it’s already an id or empty, leaves it unchanged.
- In dry run: prints sample updates and a summary. With `--write`: updates the records in the database.

Safe to run multiple times: rows that are already IDs are skipped.
