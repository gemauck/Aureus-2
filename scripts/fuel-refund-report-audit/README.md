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
  --report-stage checking \
  --enable-v2
```

| Flag | Description |
|------|-------------|
| `--report-stage checking` | Standard review (default) |
| `--report-stage final` | **Info** if asset sheets still have tank-litre columns (Compliance: remove before submit) |
| `--require-pump-readings` | Flag missing Pump Readings Before/After (off by default) |
| `--require-tank-readings` | Flag missing tank Before/After on combined + asset sheets (off by default) |
| `--require-consumption-assessment` | Flag unrealistic Consumption L/hr or L/km vs median/caps (off by default) |
| `--enable-v2` | Receipt duplicates, tank summary, auto-created assets, eligible-review consecutive, bowser low-litre |

Exit code `1` when any **error** severity finding exists.

## Sheets parsed

| Sheet | Header row | Use |
|-------|------------|-----|
| Combined Fuel Transactions | 2 | Primary transaction audit (cols A–AG) |
| Fuel Receipts | 2 | Receipt cost / price checks |
| Eligible Review - Dispenses | 1 | v2 consecutive exception cross-check |
| Combined Tank Summary | — | Refund rate + tank totals |
| Per-asset tabs (e.g. CM632) | 2 | Final-stage tank litres; bowser low-litre (v2) |

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

## v1 checks

1. `initial_dispense_no_claim` — INITIAL-DISPENSE must not claim  
2. `duplicate_transaction` — same datetime, asset, pump, abs litres  
3. `mining_eligible_missing_claim` / `_operator` / `_location`  
4. `circular_storage_tank` — bowser self-fill heuristic (excludes normal TANK1/TANK2 site fills)  
5. `dispense_exceeds_tank_size`  
6. `consecutive_hour_exceeds_tank` — 60-minute sliding window  
7. `missing_pump_readings` (checking stage)  
8. `missing_tank_litres_final` (final stage)  
9. `negative_odo_eligible`  
10. `high_odo_eligible` — >70 hr or >500 km  
11. `unrealistic_consumption` — median×3 or caps  
12. `mining_eligible_missing_operation_desc`  
13. `refund_rate_summary`  
14. `receipt_missing_fuel_cost` (+ Price/L on Fuel Receipts)  
15. `refund_total_math` — AG vs AE×AF  

## API / UI

- `POST /api/fuel-refund-audit/process` — multipart upload  
- Tools → **Fuel Refund Report Audit** (`fuel-refund-report-audit`)
