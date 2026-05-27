# Fuel Refund Report Audit

Python audit engine for InsightWare / Exxaro **Detailed Fuel Refund Report** workbooks.

## Requirements

Uses the project `venv-poareview` environment (`openpyxl`, `pandas`). From repo root:

```bash
./scripts/poa-review/setup-venv.sh
```

## CLI

```bash
npm run audit:fuel-refund-report -- \
  --input "/path/to/report.xlsx" \
  --output "/path/to/report-audit.xlsx" \
  --json "/path/to/summary.json" \
  --report-stage checking
```

| Flag | Description |
|------|-------------|
| `--report-stage checking` | Standard review (default) |
| `--report-stage final` | **Info** if asset sheets still have tank-litre columns (Compliance: remove before submit) |
| `--require-pump-readings` | Flag missing Pump Readings Before/After (off by default) |
| `--require-tank-readings` | Flag missing tank Before/After on combined + asset sheets (off by default) |
| `--require-consumption-assessment` | Flag unrealistic Consumption L/hr or L/km vs median/caps (off by default) |

Exit code `1` when any **error** severity finding exists.

## Sheets parsed

| Sheet | Header row | Use |
|-------|------------|-----|
| Combined Fuel Transactions | 2 | Primary transaction audit (cols A–AG) |
| Fuel Receipts | 2 | Receipt cost / price checks |
| Eligible Review - Dispenses | 1 | Consecutive exception cross-check |
| Combined Tank Summary | — | Refund rate + tank totals |
| Per-asset tabs (e.g. CM632) | 2 | Final-stage tank litres; bowser low-litre |

## Column map (Combined Fuel Transactions)

| Col | Header |
|-----|--------|
| A | Transaction Type |
| B | Date & Time |
| G | Asset Number |
| I | Asset Group |
| J | Asset Tank Size (L) |
| L | Storage Tank |
| M | Fuel Pump |
| N | Fuel Dispensed or Received (L) |
| O–P | Pump Readings Before / After |
| Q–T | Opening/Closing Odo, Total Usage, Total Fuel Used |
| V | Operation Description / Comment |
| X / AE | Eligible L / Eligible Volume (Claimable % of Total) |
| AA–AB | Operator / Location |
| AD | Fuel Cost (R) |
| AF–AG | Refund Price / Refund Total |

Thresholds live in `rules_config.json`.

## Audit checks (always run)

1. `initial_dispense_no_claim` — INITIAL-DISPENSE must not claim  
2. `duplicate_transaction` — same datetime, asset, pump, abs litres  
3. `mining_eligible_missing_claim` / `_operator` / `_location`  
4. `circular_storage_tank` — bowser self-fill heuristic (excludes normal TANK1/TANK2 site fills)  
5. `dispense_exceeds_tank_size`  
6. `consecutive_hour_exceeds_tank` — 60-minute sliding window  
7. `negative_odo_eligible` / `high_odo_eligible` — usage on Total Usage Km/Hr  
8. `mining_eligible_missing_operation_desc`  
9. `refund_rate_summary`  
10. `receipt_missing_fuel_cost` (+ Price/L on Fuel Receipts)  
11. `refund_total_math` — AG vs AE×AF  
12. `receipt_duplicate` — duplicate rows on Fuel Receipts  
13. `tank_summary_imbalance` — eligible volume but zero refund on Combined Tank Summary  
14. `auto_created_asset_suspect` — AUTO-/NEW-/UNALLOCATED naming patterns  
15. `eligible_review_unmarked_consecutive` — Eligible Review vs Transaction ID  
16. `bowser_low_litre` — small bowser dispense review  

Optional (checkbox / CLI flag): `missing_pump_readings`, `missing_tank_readings`, `unrealistic_consumption`, `missing_tank_litres_final` (final stage only).

## API / UI

- `POST /api/fuel-refund-audit/process` — multipart upload  
- Tools → **Fuel Refund Report Audit** (`fuel-refund-report-audit`)
