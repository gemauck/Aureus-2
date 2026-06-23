"""Parse InsightWare dispense exception workbooks and optional lookup files."""
from __future__ import annotations

import re
from datetime import datetime
from typing import Any

import pandas as pd

REQUIRED_SHEETS = ["Details as Assets"]

DETAIL_COLUMNS = [
    "date_time",
    "transaction_id",
    "asset_description",
    "asset_number",
    "asset_tag",
    "asset_group",
    "tank_size_l",
    "meter_type",
    "storage_tank",
    "fuel_pump",
    "litres",
    "opening_odo",
    "closing_odo",
    "total_usage",
    "exception_120",
    "exception_60",
    "abco_comment",
    "operation_comment",
    "refund_eligibility",
    "operator",
    "avg_economy_180d",
    "economy",
    "pct_variance",
    "economy_type",
    "department",
]

HEADER_ALIASES: dict[str, list[str]] = {
    "date_time": ["date & time", "date and time", "datetime"],
    "transaction_id": ["transaction id", "transactionid"],
    "asset_description": ["asset description"],
    "asset_number": ["asset number", "assetnumber"],
    "asset_tag": ["asset tag"],
    "asset_group": ["asset group"],
    "tank_size_l": ["asset tank size (l)", "tank size"],
    "meter_type": ["asset meter type (hr/km)", "odometer type"],
    "storage_tank": ["storage tank"],
    "fuel_pump": ["fuel pump"],
    "litres": ["litres", "liters", "fuel dispensed or received (l)"],
    "opening_odo": ["opening odo", "opening smr"],
    "closing_odo": ["closing odo", "closing smr"],
    "total_usage": ["total usage km/hr", "total smr usage", "total usage"],
    "exception_reason": ["exception reason"],
    "exception_120": [
        "exception reason (120 mins)",
        "exception reason (120 min)",
    ],
    "exception_60": [
        "exception reason (60 mins)",
        "exception reason (60 min)",
    ],
    "abco_comment": ["abco comment"],
    "operation_comment": ["operation description / comment"],
    "refund_eligibility": ["refund eligibility"],
    "operator": ["operator"],
    "location": ["location"],
    "avg_economy_180d": ["average economy (180 days)", "average economy"],
    "economy": ["economy"],
    "pct_variance": ["% varinace", "% variance"],
    "economy_type": ["economy type"],
    "department": ["department"],
}


def normalize_header(value: Any) -> str | None:
    if value is None:
        return None
    text = re.sub(r"\s+", " ", str(value).strip().lower())
    return text or None


def map_header_row(values: list[Any]) -> dict[int, str]:
    col_map: dict[int, str] = {}
    for idx, value in enumerate(values):
        norm = normalize_header(value)
        if not norm:
            continue
        for field, aliases in HEADER_ALIASES.items():
            if norm in aliases:
                col_map[idx] = field
                break
    return col_map


def parse_odo(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(",", "")
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    if not match:
        return None
    return float(match.group(0))


def parse_datetime(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value
    try:
        parsed = pd.to_datetime(value, errors="coerce")
        if pd.isna(parsed):
            return None
        return parsed.to_pydatetime()
    except Exception:
        return None


def is_asset_header_row(row_values: list[Any]) -> bool:
    if not row_values:
        return False
    first = str(row_values[0] or "").strip()
    second = row_values[1] if len(row_values) > 1 else None
    if first and not second and re.match(r"^[A-Z0-9]", first):
        return True
    if first and "asset" in first.lower() and not parse_datetime(first):
        txn = str(second or "").strip()
        if not txn or txn.lower() == "transaction id":
            return True
    return False


def is_column_header_row(row_values: list[Any]) -> bool:
    joined = " ".join(str(v or "").lower() for v in row_values[:6])
    return "date" in joined and "transaction" in joined


def is_transaction_row(row_values: list[Any], col_map: dict[int, str]) -> bool:
    if not col_map:
        return False
    txn_idx = next((i for i, f in col_map.items() if f == "transaction_id"), None)
    if txn_idx is None:
        return False
    txn = str(row_values[txn_idx] or "").strip()
    if not txn or txn.lower() == "transaction id":
        return False
    return True


def row_to_record(
    row_values: list[Any],
    col_map: dict[int, str],
    asset_number: str | None = None,
) -> dict[str, Any]:
    record: dict[str, Any] = {key: None for key in DETAIL_COLUMNS}
    for idx, field in col_map.items():
        if idx >= len(row_values):
            continue
        record[field] = row_values[idx]

    if asset_number and not record.get("asset_number"):
        record["asset_number"] = asset_number

    record["date_time"] = parse_datetime(record.get("date_time"))
    record["opening_odo_num"] = parse_odo(record.get("opening_odo"))
    record["closing_odo_num"] = parse_odo(record.get("closing_odo"))
    record["total_usage_num"] = parse_odo(record.get("total_usage"))

    litres = record.get("litres")
    if litres is not None:
        try:
            record["litres"] = float(str(litres).replace(",", ""))
        except ValueError:
            record["litres"] = None

    tank = record.get("tank_size_l")
    if tank is not None:
        try:
            record["tank_size_l"] = float(str(tank).replace(",", ""))
        except ValueError:
            record["tank_size_l"] = None

    if record.get("asset_number") is not None:
        record["asset_number"] = str(record["asset_number"]).strip()

    # Raw export single exception column → 120 min column until split
    if record.get("exception_reason") and not record.get("exception_120"):
        record["exception_120"] = record["exception_reason"]

    return record


def parse_details_sheet(df: pd.DataFrame) -> list[dict[str, Any]]:
    transactions: list[dict[str, Any]] = []
    col_map: dict[int, str] = {}
    current_asset: str | None = None

    for _, row in df.iterrows():
        values = [None if pd.isna(v) else v for v in row.tolist()]

        if is_column_header_row(values):
            col_map = map_header_row(values)
            continue

        if is_asset_header_row(values):
            current_asset = str(values[0] or "").strip() or current_asset
            continue

        if not is_transaction_row(values, col_map):
            continue

        record = row_to_record(values, col_map, current_asset)
        if record.get("transaction_id"):
            transactions.append(record)

    return transactions


def parse_flat_sheet(path: str, sheet_name: str) -> pd.DataFrame:
    return pd.read_excel(path, sheet_name=sheet_name, header=None, engine="openpyxl")


def detect_workbook(path: str) -> dict[str, Any]:
    xl = pd.ExcelFile(path, engine="openpyxl")
    sheet_names = xl.sheet_names
    missing = [s for s in REQUIRED_SHEETS if s not in sheet_names]
    return {
        "valid": len(missing) == 0,
        "missing_sheets": missing,
        "sheet_names": sheet_names,
        "has_review_queue": "Transactions deemed ineligible" in sheet_names,
        "has_possible_cause": "Possible Cause Summary" in sheet_names,
    }


def load_workbook(path: str) -> dict[str, Any]:
    detection = detect_workbook(path)
    if not detection["valid"]:
        return {
            "detection": detection,
            "transactions": [],
            "review_queue": [],
            "possible_causes": [],
            "summary_per_asset": [],
        }

    df = parse_flat_sheet(path, "Details as Assets")
    transactions = parse_details_sheet(df)

    review_queue: list[dict[str, Any]] = []
    if "Transactions deemed ineligible" in detection["sheet_names"]:
        rq_df = parse_flat_sheet(path, "Transactions deemed ineligible")
        review_queue = parse_details_sheet(rq_df)

    possible_causes: list[dict[str, Any]] = []
    if "Possible Cause Summary" in detection["sheet_names"]:
        pcs = parse_flat_sheet(path, "Possible Cause Summary")
        for _, row in pcs.iterrows():
            if str(row.iloc[0] or "").strip().lower() == "exception reason":
                continue
            exc = row.iloc[0]
            cause = row.iloc[1]
            if exc and cause and str(exc).lower() != "total":
                possible_causes.append(
                    {
                        "exception_reason": str(exc).strip(),
                        "possible_cause": str(cause).strip(),
                        "transaction_count": row.iloc[2],
                        "litres": row.iloc[3],
                    }
                )

    summary_per_asset: list[dict[str, Any]] = []
    if "Summary Per Asset" in detection["sheet_names"]:
        spa = parse_flat_sheet(path, "Summary Per Asset")
        for _, row in spa.iterrows():
            if str(row.iloc[0] or "").strip().lower() == "asset number":
                continue
            asset = row.iloc[0]
            if asset and str(asset).strip().lower() != "total":
                summary_per_asset.append(
                    {
                        "asset_number": str(asset).strip(),
                        "asset_description": row.iloc[1],
                        "department": row.iloc[2],
                        "transaction_count": row.iloc[3],
                        "litres": row.iloc[4],
                    }
                )

    return {
        "detection": detection,
        "transactions": transactions,
        "review_queue": review_queue,
        "possible_causes": possible_causes,
        "summary_per_asset": summary_per_asset,
    }


def _sheet_with_headers(path: str, required: set[str]) -> tuple[str, pd.DataFrame] | tuple[None, None]:
    xl = pd.ExcelFile(path, engine="openpyxl")
    for sheet in xl.sheet_names:
        df = pd.read_excel(path, sheet_name=sheet, header=0, engine="openpyxl")
        headers = {normalize_header(c) for c in df.columns}
        if required.issubset(headers):
            return sheet, df
    return None, None


def parse_asset_lookup(path: str | None) -> dict[str, dict[str, Any]]:
    """Parse Asset Info Lookup workbook keyed by asset number."""
    if not path:
        return {}

    _, df = _sheet_with_headers(path, {"asset number"})
    if df is None:
        return {}
    cols = {normalize_header(c): c for c in df.columns}
    asset_col = cols.get("asset number")
    if not asset_col:
        return {}

    lookup: dict[str, dict[str, Any]] = {}
    for _, row in df.iterrows():
        asset = str(row.get(asset_col) or "").strip()
        if not asset:
            continue
        lookup[asset] = {
            "asset_group": row.get(cols.get("asset group")),
            "asset_tag": row.get(cols.get("asset tag")),
            "meter_type": row.get(cols.get("odometer type")),
            "tank_size_l": row.get(cols.get("tank size")),
            "avg_economy_180d": row.get(cols.get("average economy")),
            "avg_consumption": row.get(cols.get("average consumption")),
            "department": row.get(cols.get("department")),
            "default_operation": row.get(cols.get("default operation")),
        }
    return lookup


def parse_avr_sync_lookup(path: str | None) -> list[dict[str, Any]]:
    """Parse AVR Sync export rows for transaction matching."""
    if not path:
        return []

    _, df = _sheet_with_headers(path, {"id", "code"})
    if df is None:
        return []
    cols = {normalize_header(c): c for c in df.columns}

    rows: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        avr_id = row.get(cols.get("id"))
        trans_num = row.get(cols.get("trans #"))
        code = row.get(cols.get("code"))
        date_val = row.get(cols.get("date"))
        pan = row.get(cols.get("pan"))
        if avr_id is None and trans_num is None:
            continue
        rows.append(
            {
                "avr_id": str(int(avr_id)) if pd.notna(avr_id) and str(avr_id).strip() else None,
                "trans_num": str(int(trans_num)) if pd.notna(trans_num) and str(trans_num).strip() else None,
                "asset_code": str(code).strip() if pd.notna(code) else None,
                "date": parse_datetime(date_val),
                "pan": str(pan).strip() if pd.notna(pan) else None,
            }
        )
    return rows
