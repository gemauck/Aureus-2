# Dispense → Gilbarco (side-by-side)

Converts **Fuel Dispense Report** exports (FuelTrack / Sparrow `Sheet1`) into a single workbook row per dispense line: **Gilbarco columns on the left**, **original Sparrow columns on the right**.

## Requirements

Uses the project `venv-poareview` environment (`openpyxl`). From repo root:

```bash
./scripts/poa-review/setup-venv.sh
```

## Gilbarco template (fleet lookup only)

Fleet/pump metadata is loaded from:

`scripts/dispense-to-transactions/gilbarco-template.xlsx`

## ERP UI

**Tools → Sparrow to Gilbarco** — upload the dispense report only.

Deep link: `/tools/sparrow-to-gilbarco`

- Every dispense row is included (including lines without an asset).
- Download: **`Fuel Dispense Report YYYYMMDD - YYYYMMDD.xlsx`**
- One sheet: **Fuel Dispense Report** (side-by-side layout).

## CLI

```bash
npm run convert:dispense-to-transactions -- \
  --input "/path/to/Fuel Dispense Report.xlsx" \
  --output-dir "/path/to/output-folder"
```

## Output sheet

| Row | Content |
|-----|---------|
| 1 | Section titles: “Gilbarco (converted)” \| “Original dispense (Sparrow)” |
| 2 | Column headers (Gilbarco then Sparrow) |
| 3+ | One data row per dispense line |

No **Fuel Breakdown** or **Transactions Exl. Bowsers** tabs.

## Tests

```bash
npm run convert:dispense-to-transactions:contract
```
