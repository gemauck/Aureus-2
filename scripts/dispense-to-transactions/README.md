# Dispense → Transactions & Fuel Breakdown

Converts **Fuel Dispense Report** exports (FuelTrack / InsightWare single-sheet `Sheet1`) into the **Transactions & Fuel Breakdown** workbook layout used for refund / POA workflows.

## Requirements

Uses the project `venv-poareview` environment (`openpyxl`). From repo root:

```bash
./scripts/poa-review/setup-venv.sh
```

## Gilbarco template

Fleet/pump lookup and sheet layout come from the bundled template:

`scripts/dispense-to-transactions/gilbarco-template.xlsx`

(No reference upload required in the ERP tool.)

## ERP UI

**Tools → Sparrow to Gilbarco** — upload the dispense report only.

Deep link: `/tools/sparrow-to-gilbarco`

Download filename: **`Fuel Dispense Report YYYYMMDD - YYYYMMDD.xlsx`** (from min/max transaction dates in the dispense file).

Output includes a **Fuel Dispense Source** tab with the original dispense rows.

## CLI

```bash
npm run convert:dispense-to-transactions -- \
  --input "/path/to/Fuel Dispense Report.xlsx" \
  --output-dir "/path/to/output-folder"
```

| Flag | Description |
|------|-------------|
| `--output` | Explicit output path (overrides auto naming) |
| `--output-dir` | Folder for auto-named output (default: same folder as input) |
| `--template` | Override Gilbarco template path |
| `--include-override-fills` | Include small manual override rows without asset numbers |
| `--json` | Write row counts and warnings to a JSON summary |

## Output sheets

| Sheet | Contents |
|-------|----------|
| **Fuel Dispense Source** | Original Sparrow/FuelTrack dispense export (all columns) |
| `All Transactions` | Every converted row (vehicles + bowser bulk fills) |
| `Transactions Exl. Bowsers` | Vehicle dispenses only (bowser rows excluded) |
| `Fuel Breakdown` | Copied from Gilbarco template |

## Tests

```bash
npm run convert:dispense-to-transactions:contract
```
