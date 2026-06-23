# Dispense Exception Prep

Prepares InsightWare **Transaction Exceptions – In Context** workbooks for analyst review (diesel refund dispense exceptions).

## CLI

```bash
npm run prepare:dispense-exception -- \
  --input "/path/to/exceptions-in-context.xlsx" \
  --output "/path/to/prepared.xlsx" \
  --asset-lookup "/path/to/asset-info-lookup.xlsx" \
  --avr-sync-lookup "/path/to/avr-sync.xlsx" \
  --json "/path/to/summary.json"
```

| Flag | Description |
|------|-------------|
| `--asset-lookup` | Optional Asset Info Lookup export (department, 180-day economy, tags) |
| `--avr-sync-lookup` | Optional AVR Sync export for auto-flagging sync transactions |
| `--economy-threshold` | Abs variance for review queue (default `0.6` = 60%) |
| `--site-name` | Title on summary sheets (default: inferred from filename) |

## Output workbook

| Sheet | Contents |
|-------|----------|
| Details as Assets | Mining-eligible rows with 120/60 exception split, economy, highlights |
| Transactions for Review | Escalated rows for analyst queue |
| Possible Cause Summary | Exception reason × suggested cause rollup |
| Summary Per Asset | Review queue grouped by asset |
| Asset Info Lookup | Copied from upload when provided |
| AVR Sync Lookup | Copied from upload when provided |

## API / UI

- `POST /api/dispense-exception-prep/process` — multipart: `workbook` (required), `assetLookup`, `avrSyncLookup`
- Teams → **Data Analytics** → **Exception Prep** (`?tab=dispense-exception-prep`)

## Tests

```bash
npm run prepare:dispense-exception:contract
```
