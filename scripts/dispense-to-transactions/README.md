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

**Tools → Sparrow fuel dispense converter** — upload the dispense report; choose **Gilbarco** or **WinShuttle** output.

Deep link: `/tools/sparrow-to-gilbarco`

- Every dispense row is included (including lines without an asset).
- **Gilbarco:** download **`Fuel Dispense Report YYYYMMDD - YYYYMMDD.xlsx`** — one sheet, side-by-side layout.
- **WinShuttle:** download **`WinShuttle Report YYYYMMDD - YYYYMMDD.xlsx`** — SAP goods-movement upload sheet.

## CLI

```bash
npm run convert:dispense-to-transactions -- \
  --input "/path/to/Fuel Dispense Report.xlsx" \
  --output-dir "/path/to/output-folder" \
  --format gilbarco

npm run convert:dispense-to-transactions -- \
  --input "/path/to/Fuel Dispense Report.xlsx" \
  --output-dir "/path/to/output-folder" \
  --format winshuttle
```

## Output sheets

### Gilbarco (default)

| Row | Content |
|-----|---------|
| 1 | Section titles: “Gilbarco (converted)” \| “Original dispense (Sparrow)” |
| 2 | Column headers (Gilbarco then Sparrow) |
| 3+ | One data row per dispense line |

### WinShuttle

| Row | Content |
|-----|---------|
| 1 | Human-readable WinShuttle column titles |
| 2 | SAP field names (`GOHEAD-MTSNR`, `GOITEM-MAKTX`, …) |
| 3 | Report end date in the Material column |
| 4+ | Fleet ID, material, litres, storage location, goods recipient, internal order, product, plant |

Fixed WinShuttle values (material, storage location, goods recipient, product, plant name) are in `pump_config.json` under `winshuttle`.

No **Fuel Breakdown** or **Transactions Exl. Bowsers** tabs in either format.

## Tests

```bash
npm run convert:dispense-to-transactions:contract
```
