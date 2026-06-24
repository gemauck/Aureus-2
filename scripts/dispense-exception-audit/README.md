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
| `--prior-prepared` | Optional prior-month prepared workbook for month-over-month diff |
| `--rule-profile` | Site rule profile key (`belfast`, `strict`; default from `site_rules.json`) |
| `--economy-threshold` | Abs variance when economy escalation is enabled on a profile |
| `--site-name` | Title on summary sheets (default: inferred from filename) |

## Output workbook

| Sheet | Contents |
|-------|----------|
| Details as Assets | Light-touch update: highlights + single Exception Reason (layout preserved) |
| Transactions deemed ineligible | Escalated rows with Review Reason and suggested Abco Comment |
| Possible Cause Summary | Exception reason × suggested cause rollup + Analyst Notes column |
| Summary Per Asset | Review queue grouped by asset |
| Non-Mining Excluded | Rows filtered out of mining-eligible processing |
| Exception Reason Glossary | Reference for analysts |
| Asset Info Lookup | Copied from source or upload when provided |
| AVR Sync Lookup | Copied from upload when provided |

## API / UI

- `POST /api/dispense-exception-prep/process` — multipart: `workbook` (required), `assetLookup`, `avrSyncLookup`
- Teams → **Data Analytics** → **Exception Prep** (`?tab=dispense-exception-prep`)

## Tests

```bash
npm run prepare:dispense-exception:contract
```
