# Dispense → Transactions & Fuel Breakdown

Converts **Fuel Dispense Report** exports (FuelTrack / InsightWare single-sheet `Sheet1`) into the **Transactions & Fuel Breakdown** workbook layout used for refund / POA workflows.

## Requirements

Uses project `venv-poareview` (`openpyxl`). From repo root:

```bash
./scripts/poa-review/setup-venv.sh
```

## ERP UI

**Tools → Sparrow to Gilbarco** — upload dispense + reference workbooks in the browser (requires `venv-poareview` on the server).

Deep link: `/tools/sparrow-to-gilbarco`

## CLI

```bash
npm run convert:dispense-to-transactions -- \
  --input "/path/to/Fuel Dispense Report.xlsx" \
  --reference "/path/to/Transactions & Fuel Breakdown YYYYMMDD - YYYYMMDD.xlsx" \
  --output "/path/to/output.xlsx"
```

| Flag | Description |
|------|-------------|
| `--reference` | Existing Transactions workbook — fleet IDs are matched here for Make/Model, pump codes, Group4/5, etc. |
| `--template` | Optional workbook whose extra sheets (e.g. `Fuel Breakdown`) are copied; defaults to `--reference` |
| `--pump-config` | JSON routing overrides (`pump_config.json`) for new pumps such as `OTK105M (FuelTrack)` |
| `--include-override-fills` | Include small manual override rows without asset numbers (normally skipped) |
| `--json` | Write row counts and warnings to a JSON summary |

## Output sheets

| Sheet | Contents |
|-------|----------|
| `All Transactions` | Every converted row (vehicles + bowser bulk fills) |
| `Transactions Exl. Bowsers` | Vehicle dispenses only (bowser rows excluded) |
| `Fuel Breakdown` | Copied from template unchanged |

## Mapping notes

- **Fleet ID** ← `Asset Number` / `Asset Registration`
- **Voucher Number** ← `API ID`
- **Dates** formatted as `DD/MM/YYYY HH:MM:SS` to match the target export
- **Pump / Device** — from reference fleet row when present; otherwise `pump_config.json` routes by `Group1` + `Asset Owner`
- **Bowser fills** — rows without an asset where override mentions bowser or volume ≥ 50 L on FuelTrack pumps; uses `OTK105M` bowser template from reference when available

## Tests

```bash
npm run convert:dispense-to-transactions:contract
```
