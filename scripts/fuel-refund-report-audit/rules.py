"""Fuel refund report audit rules (v1 + optional v2)."""
from __future__ import annotations

import json
import re
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta
from difflib import SequenceMatcher
from pathlib import Path
from statistics import median
from typing import Any

from parse_workbook import ParsedWorkbook, normalize_tx_type, sheet_has_tank_litre_columns

CONFIG_PATH = Path(__file__).resolve().parent / "rules_config.json"


@dataclass
class Finding:
    check_id: str
    severity: str
    sheet: str
    excel_row: int | None
    transaction_id: str | None = None
    asset_number: str | None = None
    message: str = ""
    process_task: str | None = None
    fields: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def load_config() -> dict[str, Any]:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


def parse_num(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).replace(",", "").strip()
    if not s or s.lower() in ("[no meter]", "n/a", "-"):
        return None
    try:
        return float(s)
    except ValueError:
        m = re.search(r"-?\d+(?:\.\d+)?", s)
        return float(m.group(0)) if m else None


def parse_dt(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value
    s = str(value).strip()
    for fmt in (
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M",
    ):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def litres_abs(value: Any) -> float | None:
    n = parse_num(value)
    if n is None:
        return None
    return abs(n)


def norm_token(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").lower())


def is_mining_eligible_row(asset_group: Any) -> bool:
    ag = str(asset_group or "").strip()
    if not ag:
        return False
    low = ag.lower()
    if "non-mining" in low or "non-eligible" in low or "non eligible" in low:
        return False
    if ag == "Mining - Eligible":
        return True
    if "mining" in low and "eligible" in low:
        return True
    return False


def has_non_eligible_reason(op_desc: Any, cfg: dict[str, Any]) -> bool:
    text = str(op_desc or "").lower()
    if not text:
        return False
    for kw in cfg.get("non_eligible_reason_keywords", []):
        if kw.lower() in text:
            return True
    return False


def _process_task(cfg: dict[str, Any], check_id: str) -> str | None:
    return cfg.get("process_task_names", {}).get(check_id)


def _row_meta(row: dict, check_id: str, severity: str, message: str, cfg: dict[str, Any], **fields) -> Finding:
    return Finding(
        check_id=check_id,
        severity=severity,
        sheet=row.get("_sheet", "Combined Fuel Transactions"),
        excel_row=row.get("_excel_row"),
        transaction_id=str(row.get("Transaction ID") or "") or None,
        asset_number=str(row.get("Asset Number") or "") or None,
        message=message,
        process_task=_process_task(cfg, check_id),
        fields=fields,
    )


def check_initial_dispense_no_claim(rows: list[dict], cfg: dict[str, Any]) -> list[Finding]:
    findings: list[Finding] = []
    for row in rows:
        if normalize_tx_type(row.get("Transaction Type")) != "INITIAL-DISPENSE":
            continue
        refund = parse_num(row.get("Refund Total"))
        eligible_vol = parse_num(row.get("Eligible Volume (L) (Claimable % of Total)"))
        eligible_l = parse_num(row.get("Eligible L"))
        if (refund and refund != 0) or (eligible_vol and eligible_vol != 0) or (
            eligible_l and eligible_l > 0
        ):
            findings.append(
                _row_meta(
                    row,
                    "initial_dispense_no_claim",
                    "error",
                    "INITIAL-DISPENSE must not have Refund Total or Eligible Volume / Eligible L claim",
                    cfg,
                    refund_total=refund,
                    eligible_volume=eligible_vol,
                )
            )
    return findings


def check_duplicate_transaction(rows: list[dict], cfg: dict[str, Any]) -> list[Finding]:
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for row in rows:
        dt = row.get("Date & Time")
        asset = str(row.get("Asset Number") or "").strip()
        pump = str(row.get("Fuel Pump") or "").strip()
        litres = litres_abs(row.get("Fuel Dispensed or Received (L)"))
        if not dt or not asset or litres is None:
            continue
        key = (str(dt).strip(), asset, pump, round(litres, 4))
        groups[key].append(row)
    findings: list[Finding] = []
    for key, members in groups.items():
        if len(members) < 2:
            continue
        for row in members:
            findings.append(
                _row_meta(
                    row,
                    "duplicate_transaction",
                    "error",
                    f"Duplicate transaction ({len(members)} rows): same datetime, asset, pump, litres",
                    cfg,
                    duplicate_key=key,
                )
            )
    return findings


def _refund_marked_non_eligible(row: dict) -> bool:
    re = str(row.get("Refund Eligibility") or "").strip().lower()
    return "non-eligible" in re or re == "non eligible"


def check_mining_eligible_missing_claim(rows: list[dict], cfg: dict[str, Any]) -> list[Finding]:
    findings: list[Finding] = []
    for row in rows:
        if not is_mining_eligible_row(row.get("Asset Group")):
            continue
        if _refund_marked_non_eligible(row):
            continue
        if has_non_eligible_reason(row.get("Operation Description / Comment"), cfg):
            continue
        refund = parse_num(row.get("Refund Total")) or 0
        ev = parse_num(row.get("Eligible Volume (L) (Claimable % of Total)")) or 0
        el = parse_num(row.get("Eligible L")) or 0
        if refund <= 0 and ev <= 0 and el <= 0:
            findings.append(
                _row_meta(
                    row,
                    "mining_eligible_missing_claim",
                    "error",
                    "Mining-eligible row has no claim (Eligible Volume / Refund Total / Eligible L)",
                    cfg,
                )
            )
    return findings


def check_mining_eligible_missing_operator(rows: list[dict], cfg: dict[str, Any]) -> list[Finding]:
    findings: list[Finding] = []
    for row in rows:
        if not is_mining_eligible_row(row.get("Asset Group")):
            continue
        op = str(row.get("Operator") or "").strip()
        if not op:
            findings.append(
                _row_meta(
                    row,
                    "mining_eligible_missing_operator",
                    "error",
                    "Mining-eligible row missing Operator",
                    cfg,
                )
            )
    return findings


def check_mining_eligible_missing_location(rows: list[dict], cfg: dict[str, Any]) -> list[Finding]:
    findings: list[Finding] = []
    for row in rows:
        if not is_mining_eligible_row(row.get("Asset Group")):
            continue
        loc = str(row.get("Location") or "").strip()
        if not loc:
            findings.append(
                _row_meta(
                    row,
                    "mining_eligible_missing_location",
                    "error",
                    "Mining-eligible row missing Location",
                    cfg,
                )
            )
    return findings


def _is_bowser_like(row: dict) -> bool:
    desc = str(row.get("Asset Description") or "").lower()
    return "bowser" in desc or "tanker" in desc


def check_circular_storage_tank(rows: list[dict], cfg: dict[str, Any]) -> list[Finding]:
    findings: list[Finding] = []
    fixed_tanks = {norm_token(t) for t in cfg.get("fixed_site_tanks", ["TANK1", "TANK2"])}
    threshold = float(cfg.get("circular_similarity_threshold", 0.85))

    for row in rows:
        tx = normalize_tx_type(row.get("Transaction Type"))
        if tx != "DISPENSE":
            continue
        storage = str(row.get("Storage Tank") or "").strip()
        storage_n = norm_token(storage)
        asset_num = str(row.get("Asset Number") or "").strip()
        asset_desc = str(row.get("Asset Description") or "").strip()

        if storage_n in fixed_tanks and not _is_bowser_like(row):
            continue

        if norm_token(asset_num) and norm_token(asset_num) == storage_n:
            findings.append(
                _row_meta(
                    row,
                    "circular_storage_tank",
                    "warning",
                    f"Storage tank '{storage}' matches asset number '{asset_num}' (possible bowser self-fill)",
                    cfg,
                    storage_tank=storage,
                )
            )
            continue

        if not _is_bowser_like(row):
            continue

        for candidate in (asset_num, asset_desc):
            if not candidate or not storage:
                continue
            ratio = SequenceMatcher(None, norm_token(candidate), norm_token(storage)).ratio()
            if ratio >= threshold:
                findings.append(
                    _row_meta(
                        row,
                        "circular_storage_tank",
                        "warning",
                        f"Bowser asset may be filling from itself (storage '{storage}' ~ '{candidate}', similarity {ratio:.2f})",
                        cfg,
                        similarity=ratio,
                    )
                )
                break
    return findings


def check_dispense_exceeds_tank_size(rows: list[dict], cfg: dict[str, Any]) -> list[Finding]:
    findings: list[Finding] = []
    dispense_types = {"DISPENSE", "INITIAL-DISPENSE", "MOBILE-BOWSER-TRANSFER"}
    for row in rows:
        if normalize_tx_type(row.get("Transaction Type")) not in dispense_types:
            continue
        tank = parse_num(row.get("Asset Tank Size (L)"))
        litres = litres_abs(row.get("Fuel Dispensed or Received (L)"))
        if tank is None or litres is None or tank <= 0:
            continue
        if litres > tank + 0.01:
            findings.append(
                _row_meta(
                    row,
                    "dispense_exceeds_tank_size",
                    "error",
                    f"Dispense {litres:.2f} L exceeds asset tank size {tank:.2f} L",
                    cfg,
                    litres=litres,
                    tank_size=tank,
                )
            )
    return findings


def check_consecutive_hour_exceeds_tank(rows: list[dict], cfg: dict[str, Any]) -> list[Finding]:
    window_min = int(cfg.get("consecutive_window_minutes", 60))
    by_asset: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        if normalize_tx_type(row.get("Transaction Type")) != "DISPENSE":
            continue
        asset = str(row.get("Asset Number") or "").strip()
        dt = parse_dt(row.get("Date & Time"))
        litres = litres_abs(row.get("Fuel Dispensed or Received (L)"))
        if not asset or not dt or litres is None:
            continue
        by_asset[asset].append(row)

    findings: list[Finding] = []
    for asset, asset_rows in by_asset.items():
        asset_rows.sort(key=lambda r: parse_dt(r.get("Date & Time")) or datetime.min)
        for i, anchor in enumerate(asset_rows):
            anchor_dt = parse_dt(anchor.get("Date & Time"))
            if not anchor_dt:
                continue
            tank = parse_num(anchor.get("Asset Tank Size (L)")) or 0
            if tank <= 0:
                continue
            window_end = anchor_dt + timedelta(minutes=window_min)
            total = 0.0
            window_rows = [anchor]
            for other in asset_rows[i:]:
                odt = parse_dt(other.get("Date & Time"))
                if not odt or odt > window_end:
                    break
                l = litres_abs(other.get("Fuel Dispensed or Received (L)"))
                if l:
                    total += l
                    if other is not anchor:
                        window_rows.append(other)
            if total > tank + 0.01:
                for row in window_rows:
                    findings.append(
                        _row_meta(
                            row,
                            "consecutive_hour_exceeds_tank",
                            "warning",
                            f"Cumulative dispense {total:.2f} L in {window_min} min exceeds tank {tank:.2f} L",
                            cfg,
                            window_litres=total,
                            tank_size=tank,
                        )
                    )
    return findings


def _pump_missing(row: dict) -> bool:
    before = parse_num(row.get("Pump Readings Before"))
    after = parse_num(row.get("Pump Readings After"))
    return before is None or after is None


def check_missing_pump_readings(rows: list[dict], cfg: dict[str, Any]) -> list[Finding]:
    need_types = {"DISPENSE", "MOBILE-BOWSER-TRANSFER", "INITIAL-DISPENSE"}
    findings: list[Finding] = []
    for row in rows:
        if normalize_tx_type(row.get("Transaction Type")) not in need_types:
            continue
        if _pump_missing(row):
            findings.append(
                _row_meta(
                    row,
                    "missing_pump_readings",
                    "warning",
                    "Missing Pump Readings Before and/or After",
                    cfg,
                )
            )
    return findings


def check_missing_tank_litres_final(parsed: ParsedWorkbook, cfg: dict[str, Any]) -> list[Finding]:
    findings: list[Finding] = []
    for sheet_name, rows in parsed.asset_sheets.items():
        if not rows:
            continue
        headers = list(rows[0].keys())
        tank_cols = sheet_has_tank_litre_columns(headers)
        if not tank_cols:
            continue
        for row in rows:
            for col in tank_cols:
                val = row.get(col)
                if val is not None and str(val).strip() not in ("", "[No Meter]"):
                    findings.append(
                        Finding(
                            check_id="missing_tank_litres_final",
                            severity="info",
                            sheet=sheet_name,
                            excel_row=row.get("_excel_row"),
                            transaction_id=str(row.get("Transaction ID") or "") or None,
                            asset_number=str(row.get("Asset Number") or "") or None,
                            message=f"Final-stage workbook still has tank litre data in '{col}' (Compliance policy: remove tank litres)",
                            process_task=_process_task(cfg, "missing_tank_litres_final"),
                            fields={"column": col, "value": val},
                        )
                    )
                    break
    return findings


def check_negative_odo_eligible(rows: list[dict], cfg: dict[str, Any]) -> list[Finding]:
    findings: list[Finding] = []
    for row in rows:
        el = parse_num(row.get("Eligible L")) or 0
        if el <= 0:
            continue
        used = parse_num(row.get("Total Fuel Used (L)"))
        if used is not None and used < 0:
            findings.append(
                _row_meta(
                    row,
                    "negative_odo_eligible",
                    "error",
                    f"Eligible L > 0 but Total Fuel Used is negative ({used})",
                    cfg,
                )
            )
    return findings


def _parse_usage_hr_km(value: Any) -> tuple[float | None, str | None]:
    if value is None:
        return None, None
    s = str(value).strip().lower()
    n = parse_num(value)
    if n is None:
        return None, None
    if "km" in s:
        return n, "km"
    if "hr" in s or "hour" in s:
        return n, "hr"
    meter = str(value)
    if "km" in meter.lower():
        return n, "km"
    return n, "hr"


def check_high_odo_eligible(rows: list[dict], cfg: dict[str, Any]) -> list[Finding]:
    max_hr = float(cfg.get("high_odo_hours", 70))
    max_km = float(cfg.get("high_odo_km", 500))
    findings: list[Finding] = []
    for row in rows:
        el = parse_num(row.get("Eligible L")) or 0
        if el <= 0:
            continue
        usage, unit = _parse_usage_hr_km(row.get("Total Usage Km/Hr"))
        if usage is None:
            continue
        if unit == "km" and usage > max_km:
            findings.append(
                _row_meta(
                    row,
                    "high_odo_eligible",
                    "warning",
                    f"Eligible usage {usage} km exceeds threshold {max_km} km",
                    cfg,
                )
            )
        elif unit == "hr" and usage > max_hr:
            findings.append(
                _row_meta(
                    row,
                    "high_odo_eligible",
                    "warning",
                    f"Eligible usage {usage} hr exceeds threshold {max_hr} hr",
                    cfg,
                )
            )
    return findings


def _consumption_value(row: dict) -> float | None:
    c = parse_num(row.get("Consumption"))
    if c is not None:
        return c
    used = parse_num(row.get("Total Fuel Used (L)"))
    usage, _ = _parse_usage_hr_km(row.get("Total Usage Km/Hr"))
    if used and usage and usage > 0:
        return used / usage
    return None


def check_unrealistic_consumption(rows: list[dict], cfg: dict[str, Any]) -> list[Finding]:
    mult = float(cfg.get("consumption_median_multiplier", 3))
    min_samples = int(cfg.get("consumption_min_samples", 5))
    cap_hr = float(cfg.get("consumption_caps_l_per_hr", 200))
    cap_km = float(cfg.get("consumption_caps_l_per_km", 5))

    by_asset: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        if (parse_num(row.get("Eligible L")) or 0) <= 0:
            continue
        asset = str(row.get("Asset Number") or "").strip()
        cv = _consumption_value(row)
        if asset and cv is not None and cv > 0:
            by_asset[asset].append(cv)

    medians = {a: median(vals) for a, vals in by_asset.items() if len(vals) >= min_samples}
    findings: list[Finding] = []
    for row in rows:
        cv = _consumption_value(row)
        if cv is None:
            continue
        asset = str(row.get("Asset Number") or "").strip()
        _, unit = _parse_usage_hr_km(row.get("Total Usage Km/Hr"))
        if unit == "km" and cv > cap_km:
            findings.append(
                _row_meta(
                    row,
                    "unrealistic_consumption",
                    "warning",
                    f"Consumption {cv:.2f} L/km exceeds cap {cap_km}",
                    cfg,
                )
            )
        elif unit != "km" and cv > cap_hr:
            findings.append(
                _row_meta(
                    row,
                    "unrealistic_consumption",
                    "warning",
                    f"Consumption {cv:.2f} L/hr exceeds cap {cap_hr}",
                    cfg,
                )
            )
        med = medians.get(asset)
        if med and cv > med * mult:
            findings.append(
                _row_meta(
                    row,
                    "unrealistic_consumption",
                    "warning",
                    f"Consumption {cv:.2f} exceeds {mult}× asset median ({med:.2f})",
                    cfg,
                    asset_median=med,
                )
            )
    return findings


def check_mining_eligible_missing_operation_desc(rows: list[dict], cfg: dict[str, Any]) -> list[Finding]:
    findings: list[Finding] = []
    for row in rows:
        if not is_mining_eligible_row(row.get("Asset Group")):
            continue
        if has_non_eligible_reason(row.get("Operation Description / Comment"), cfg):
            continue
        desc = str(row.get("Operation Description / Comment") or "").strip()
        if not desc:
            findings.append(
                _row_meta(
                    row,
                    "mining_eligible_missing_operation_desc",
                    "error",
                    "Mining-eligible row missing Operation Description / Comment",
                    cfg,
                )
            )
    return findings


def check_refund_rate_summary(rows: list[dict], parsed: ParsedWorkbook, cfg: dict[str, Any]) -> list[Finding]:
    findings: list[Finding] = []
    rates = parsed.refund_rates
    if not rates:
        findings.append(
            Finding(
                check_id="refund_rate_summary",
                severity="warning",
                sheet="Combined Tank Summary",
                excel_row=None,
                message="No refund rate found on Combined Tank Summary",
                process_task=_process_task(cfg, "refund_rate_summary"),
            )
        )
        return findings

    primary_rate = rates[0]["rate"]
    tol = float(cfg.get("refund_rate_tolerance", 0.001))
    for row in rows:
        rp = parse_num(row.get("Refund Price"))
        if rp is None:
            continue
        if abs(rp - primary_rate) > tol:
            findings.append(
                _row_meta(
                    row,
                    "refund_rate_summary",
                    "warning",
                    f"Refund Price {rp} differs from summary rate {primary_rate}",
                    cfg,
                    summary_rate=primary_rate,
                )
            )
    return findings


def check_receipt_missing_fuel_cost(rows: list[dict], receipts: list[dict], cfg: dict[str, Any]) -> list[Finding]:
    findings: list[Finding] = []
    for row in rows:
        if normalize_tx_type(row.get("Transaction Type")) != "FUEL-RECEIPT":
            continue
        cost = parse_num(row.get("Fuel Cost (R)"))
        if cost is None or cost <= 0:
            findings.append(
                _row_meta(
                    row,
                    "receipt_missing_fuel_cost",
                    "error",
                    "FUEL-RECEIPT on combined sheet missing Fuel Cost (R)",
                    cfg,
                )
            )
    for rec in receipts:
        litres = parse_num(rec.get("Litres Received")) or 0
        cost = parse_num(rec.get("Fuel Cost (R)"))
        price = parse_num(rec.get("Price/L"))
        if cost is None or cost <= 0:
            findings.append(
                Finding(
                    check_id="receipt_missing_fuel_cost",
                    severity="error",
                    sheet=rec.get("_sheet", "Fuel Receipts"),
                    excel_row=rec.get("_excel_row"),
                    message="Fuel Receipt missing Fuel Cost (R)",
                    process_task=_process_task(cfg, "receipt_missing_fuel_cost"),
                    fields={"event_id": rec.get("Event ID")},
                )
            )
        if litres > 0 and (price is None or price <= 0):
            findings.append(
                Finding(
                    check_id="receipt_missing_fuel_cost",
                    severity="error",
                    sheet=rec.get("_sheet", "Fuel Receipts"),
                    excel_row=rec.get("_excel_row"),
                    message="Fuel Receipt missing Price/L where litres received > 0",
                    process_task=_process_task(cfg, "receipt_missing_fuel_cost"),
                    fields={"litres_received": litres},
                )
            )
    return findings


def check_refund_total_math(rows: list[dict], cfg: dict[str, Any]) -> list[Finding]:
    tol = float(cfg.get("refund_math_tolerance", 0.05))
    findings: list[Finding] = []
    for row in rows:
        ev = parse_num(row.get("Eligible Volume (L) (Claimable % of Total)"))
        rp = parse_num(row.get("Refund Price"))
        rt = parse_num(row.get("Refund Total"))
        if ev is None or rp is None or rt is None:
            continue
        expected = ev * rp
        if abs(rt - expected) > tol:
            findings.append(
                _row_meta(
                    row,
                    "refund_total_math",
                    "error",
                    f"Refund Total {rt} ≠ Eligible Volume × Refund Price ({expected:.4f})",
                    cfg,
                    expected=expected,
                )
            )
    return findings


# --- v2 checks ---


def check_receipt_duplicate(receipts: list[dict], cfg: dict[str, Any]) -> list[Finding]:
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for rec in receipts:
        key = (
            str(rec.get("Date & Time") or "").strip(),
            str(rec.get("Fuel Pump") or "").strip(),
            round(parse_num(rec.get("Litres Received")) or 0, 4),
            str(rec.get("Order Ref") or "").strip(),
        )
        groups[key].append(rec)
    findings: list[Finding] = []
    for key, members in groups.items():
        if len(members) < 2:
            continue
        for rec in members:
            findings.append(
                Finding(
                    check_id="receipt_duplicate",
                    severity="warning",
                    sheet=rec.get("_sheet", "Fuel Receipts"),
                    excel_row=rec.get("_excel_row"),
                    message=f"Duplicate fuel receipt ({len(members)} rows)",
                    process_task=_process_task(cfg, "receipt_duplicate"),
                    fields={"duplicate_key": key},
                )
            )
    return findings


def check_tank_summary_imbalance(parsed: ParsedWorkbook, cfg: dict[str, Any]) -> list[Finding]:
    findings: list[Finding] = []
    for tank_row in parsed.tank_summary.get("tanks", []):
        ev = tank_row.get("eligible_volume") or 0
        rt = tank_row.get("refund_total") or 0
        if ev > 0 and rt <= 0:
            findings.append(
                Finding(
                    check_id="tank_summary_imbalance",
                    severity="warning",
                    sheet="Combined Tank Summary",
                    excel_row=tank_row.get("excel_row"),
                    message=f"Tank {tank_row.get('tank')} has eligible volume but zero Refund Total",
                    process_task=_process_task(cfg, "tank_summary_imbalance"),
                )
            )
    return findings


def check_auto_created_asset_suspect(rows: list[dict], cfg: dict[str, Any]) -> list[Finding]:
    patterns = [re.compile(p, re.I) for p in cfg.get("auto_created_asset_patterns", [])]
    findings: list[Finding] = []
    for row in rows:
        asset = str(row.get("Asset Number") or "")
        desc = str(row.get("Asset Description") or "")
        for pat in patterns:
            if pat.search(asset) or pat.search(desc):
                findings.append(
                    _row_meta(
                        row,
                        "auto_created_asset_suspect",
                        "info",
                        "Asset may be auto-created — review naming",
                        cfg,
                    )
                )
                break
    return findings


def check_eligible_review_unmarked_consecutive(review_rows: list[dict], cfg: dict[str, Any]) -> list[Finding]:
    findings: list[Finding] = []
    for row in review_rows:
        exc = str(row.get("Exception Reason") or "").strip()
        tid = str(row.get("Transaction ID") or "")
        tx_id_suffix = "CONSEC" in tid.upper()
        has_consec_text = "consecutive" in exc.lower() if exc else False
        if tx_id_suffix and not exc:
            findings.append(
                Finding(
                    check_id="eligible_review_unmarked_consecutive",
                    severity="warning",
                    sheet=row.get("_sheet", "Eligible Review - Dispenses"),
                    excel_row=row.get("_excel_row"),
                    transaction_id=tid or None,
                    asset_number=str(row.get("Asset Number") or "") or None,
                    message="Transaction ID suggests consecutive dispense but Exception Reason is blank",
                    process_task=_process_task(cfg, "eligible_review_unmarked_consecutive"),
                )
            )
        if has_consec_text and "consecutive" not in tid.upper() and "CONSEC" not in tid.upper():
            findings.append(
                Finding(
                    check_id="eligible_review_unmarked_consecutive",
                    severity="info",
                    sheet=row.get("_sheet", "Eligible Review - Dispenses"),
                    excel_row=row.get("_excel_row"),
                    transaction_id=tid or None,
                    message="Exception Reason mentions consecutive but Transaction ID does not",
                    process_task=_process_task(cfg, "eligible_review_unmarked_consecutive"),
                )
            )
    return findings


def check_bowser_low_litre(rows: list[dict], cfg: dict[str, Any]) -> list[Finding]:
    threshold = float(cfg.get("bowser_low_litre_threshold", 50))
    findings: list[Finding] = []
    for row in rows:
        if normalize_tx_type(row.get("Transaction Type")) != "DISPENSE":
            continue
        if not _is_bowser_like(row):
            continue
        litres = litres_abs(row.get("Fuel Dispensed or Received (L)"))
        if litres is not None and 0 < litres < threshold:
            findings.append(
                _row_meta(
                    row,
                    "bowser_low_litre",
                    "info",
                    f"Bowser dispense {litres:.2f} L below {threshold} L — review side-tank fill",
                    cfg,
                )
            )
    return findings


def run_all_rules(
    parsed: ParsedWorkbook,
    report_stage: str = "checking",
    enable_v2: bool = False,
    config: dict[str, Any] | None = None,
) -> list[Finding]:
    cfg = config or load_config()
    rows = parsed.combined_rows
    findings: list[Finding] = []

    findings.extend(check_initial_dispense_no_claim(rows, cfg))
    findings.extend(check_duplicate_transaction(rows, cfg))
    findings.extend(check_mining_eligible_missing_claim(rows, cfg))
    findings.extend(check_mining_eligible_missing_operator(rows, cfg))
    findings.extend(check_mining_eligible_missing_location(rows, cfg))
    findings.extend(check_circular_storage_tank(rows, cfg))
    findings.extend(check_dispense_exceeds_tank_size(rows, cfg))
    findings.extend(check_consecutive_hour_exceeds_tank(rows, cfg))

    if report_stage == "checking":
        findings.extend(check_missing_pump_readings(rows, cfg))
    elif report_stage == "final":
        findings.extend(check_missing_tank_litres_final(parsed, cfg))

    findings.extend(check_negative_odo_eligible(rows, cfg))
    findings.extend(check_high_odo_eligible(rows, cfg))
    findings.extend(check_unrealistic_consumption(rows, cfg))
    findings.extend(check_mining_eligible_missing_operation_desc(rows, cfg))
    findings.extend(check_refund_rate_summary(rows, parsed, cfg))
    findings.extend(check_receipt_missing_fuel_cost(rows, parsed.fuel_receipts, cfg))
    findings.extend(check_refund_total_math(rows, cfg))

    all_rows = list(rows)
    for asset_rows in parsed.asset_sheets.values():
        all_rows.extend(asset_rows)
    if enable_v2:
        findings.extend(check_receipt_duplicate(parsed.fuel_receipts, cfg))
        findings.extend(check_tank_summary_imbalance(parsed, cfg))
        findings.extend(check_auto_created_asset_suspect(all_rows, cfg))
        findings.extend(check_eligible_review_unmarked_consecutive(parsed.eligible_review_dispenses, cfg))
        findings.extend(check_bowser_low_litre(all_rows, cfg))

    return findings


COMBINED_SHEET = "Combined Fuel Transactions"


def summarize_findings(findings: list[Finding], parsed: ParsedWorkbook) -> dict[str, Any]:
    cfg = load_config()
    by_check: dict[str, int] = defaultdict(int)
    by_severity: dict[str, int] = defaultdict(int)
    for f in findings:
        by_check[f.check_id] += 1
        by_severity[f.severity] += 1

    combined_by_row: dict[int, list[Finding]] = defaultdict(list)
    for f in findings:
        if f.sheet == COMBINED_SHEET and f.excel_row:
            combined_by_row[f.excel_row].append(f)

    audited_rows = [r for r in parsed.combined_rows if r.get("_excel_row")]
    rows_audited = len(audited_rows)
    rows_passed = 0
    rows_failed = 0
    rows_warning_only = 0
    rows_info_only = 0

    for row in audited_rows:
        row_findings = combined_by_row.get(row["_excel_row"], [])
        if not row_findings:
            rows_passed += 1
            continue
        severities = {f.severity for f in row_findings}
        if "error" in severities:
            rows_failed += 1
        elif "warning" in severities:
            rows_warning_only += 1
        else:
            rows_info_only += 1

    pass_rate_pct = round((rows_passed / rows_audited) * 100, 1) if rows_audited else 100.0

    process_tasks = cfg.get("process_task_names", {})
    all_check_ids = set(process_tasks.keys())
    checks_passed = sorted(all_check_ids - set(by_check.keys()))
    checks_failed = [
        {
            "check_id": check_id,
            "process_task": process_tasks.get(check_id),
            "count": by_check[check_id],
        }
        for check_id in sorted(by_check.keys())
    ]

    return {
        "row_count_combined": len(parsed.combined_rows),
        "rows_audited": rows_audited,
        "rows_passed": rows_passed,
        "rows_failed": rows_failed,
        "rows_warning_only": rows_warning_only,
        "rows_info_only": rows_info_only,
        "pass_rate_pct": pass_rate_pct,
        "finding_count": len(findings),
        "by_check": dict(sorted(by_check.items())),
        "by_severity": dict(sorted(by_severity.items())),
        "checks_passed": checks_passed,
        "checks_failed": checks_failed,
        "refund_rates": parsed.refund_rates,
        "parse_warnings": parsed.parse_warnings,
        "has_errors": by_severity.get("error", 0) > 0,
    }
