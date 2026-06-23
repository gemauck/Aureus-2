"""Write analyst-ready dispense exception workbook."""
from __future__ import annotations

import json
import shutil
from copy import copy
from pathlib import Path
from typing import Any

import openpyxl
import pandas as pd
from openpyxl.formatting.rule import CellIsRule, FormulaRule
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

DETAILS_SHEET = "Details as Assets"

OUTPUT_HEADERS = [
    "Date & Time",
    "Transaction ID",
    "Asset Description",
    "Asset Number",
    "Asset Tag",
    "Asset Group",
    "Asset Tank Size (L)",
    "Asset Meter Type (Hr/Km)",
    "Storage Tank",
    "Fuel Pump",
    "Litres",
    "Opening Odo",
    "Closing Odo",
    "Total Usage Km/Hr",
    "Exception Reason (120 mins)",
    "Exception Reason (60 mins)",
    "Abco Comment",
    "Operation Description / Comment",
    "Refund Eligibility",
    "Operator",
    "Average Economy (180 Days)",
    "Economy",
    "% Variance",
    "Economy Type",
    "Department",
]

FIELD_TO_HEADER = {
    "date_time": "Date & Time",
    "transaction_id": "Transaction ID",
    "asset_description": "Asset Description",
    "asset_number": "Asset Number",
    "asset_tag": "Asset Tag",
    "asset_group": "Asset Group",
    "tank_size_l": "Asset Tank Size (L)",
    "meter_type": "Asset Meter Type (Hr/Km)",
    "storage_tank": "Storage Tank",
    "fuel_pump": "Fuel Pump",
    "litres": "Litres",
    "opening_odo": "Opening Odo",
    "closing_odo": "Closing Odo",
    "total_usage": "Total Usage Km/Hr",
    "exception_120": "Exception Reason (120 mins)",
    "exception_60": "Exception Reason (60 mins)",
    "abco_comment": "Abco Comment",
    "operation_comment": "Operation Description / Comment",
    "refund_eligibility": "Refund Eligibility",
    "operator": "Operator",
    "avg_economy_180d": "Average Economy (180 Days)",
    "economy": "Economy",
    "pct_variance": "% Variance",
    "economy_type": "Economy Type",
    "department": "Department",
}

FILL_GREEN = PatternFill("solid", fgColor="D9EAD3")
FILL_ORANGE = PatternFill("solid", fgColor="FF9900")
FILL_YELLOW = PatternFill("solid", fgColor="FFFF00")
HEADER_FILL = PatternFill("solid", fgColor="1F4E79")
HEADER_FONT = Font(bold=True, color="FFFFFF")


def _row_highlight(row: dict[str, Any]) -> PatternFill | None:
    comment = str(row.get("abco_comment") or "").lower()
    if row.get("_avr_sync") or comment == "avr sync":
        return FILL_YELLOW
    if row.get("_review"):
        return FILL_ORANGE
    if row.get("exception_60") or row.get("exception_120"):
        variance = row.get("pct_variance")
        if variance is None or abs(variance) <= 0.6:
            return FILL_GREEN
    return None


def _format_cell_value(field: str, value: Any) -> Any:
    if field == "date_time" and value is not None:
        return value
    if field == "pct_variance" and isinstance(value, (int, float)):
        return value
    if field in ("economy", "avg_economy_180d", "litres", "tank_size_l") and isinstance(
        value, (int, float)
    ):
        return value
    return value


def _write_details_sheet(ws, transactions: list[dict[str, Any]]) -> None:
    ws.delete_rows(1, ws.max_row)
    for col, title in enumerate(OUTPUT_HEADERS, 1):
        cell = ws.cell(row=1, column=col, value=title)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT

    header_to_field = {v: k for k, v in FIELD_TO_HEADER.items()}
    for row_idx, record in enumerate(transactions, 2):
        fill = _row_highlight(record)
        for col, title in enumerate(OUTPUT_HEADERS, 1):
            field = header_to_field[title]
            value = _format_cell_value(field, record.get(field))
            if field == "pct_variance" and isinstance(value, float):
                cell = ws.cell(row=row_idx, column=col, value=value)
                cell.number_format = "0.0%"
            else:
                cell = ws.cell(row=row_idx, column=col, value=value)
            if fill:
                cell.fill = fill

    last_row = max(2, len(transactions) + 1)
    var_col = get_column_letter(OUTPUT_HEADERS.index("% Variance") + 1)
    exc_120_col = get_column_letter(OUTPUT_HEADERS.index("Exception Reason (120 mins)") + 1)
    exc_60_col = get_column_letter(OUTPUT_HEADERS.index("Exception Reason (60 mins)") + 1)

    ws.conditional_formatting.add(
        f"{var_col}2:{var_col}{last_row}",
        CellIsRule(operator="greaterThan", formula=['"60%"'], fill=PatternFill("solid", fgColor="B7E1CD")),
    )
    ws.conditional_formatting.add(
        f"{var_col}2:{var_col}{last_row}",
        CellIsRule(operator="lessThan", formula=['"-60%"'], fill=PatternFill("solid", fgColor="FFF2CC")),
    )
    ws.conditional_formatting.add(
        f"{exc_120_col}2:{exc_60_col}{last_row}",
        FormulaRule(formula=[f'LEN(TRIM({exc_120_col}2))>0'], fill=PatternFill("solid", fgColor="B7E1CD")),
    )

    for col in range(1, len(OUTPUT_HEADERS) + 1):
        ws.column_dimensions[get_column_letter(col)].width = 18


def _write_review_sheet(ws, title: str, rows: list[dict[str, Any]]) -> None:
    ws.title = title
    _write_details_sheet(ws, rows)


def _write_possible_cause_sheet(ws, rows: list[dict[str, Any]], site_title: str) -> None:
    ws.delete_rows(1, ws.max_row)
    ws.cell(row=1, column=1, value=site_title)
    ws.cell(row=2, column=1, value="Exception Reason")
    ws.cell(row=2, column=2, value="Possible Cause")
    ws.cell(row=2, column=3, value="Number of Transactions")
    ws.cell(row=2, column=4, value="SUM of Litres")
    for idx, row in enumerate(rows, 3):
        ws.cell(row=idx, column=1, value=row.get("exception_reason"))
        ws.cell(row=idx, column=2, value=row.get("possible_cause"))
        ws.cell(row=idx, column=3, value=row.get("transaction_count"))
        ws.cell(row=idx, column=4, value=row.get("litres"))
    total_row = len(rows) + 3
    ws.cell(row=total_row, column=1, value="Total")
    ws.cell(row=total_row, column=3, value=f"=SUM(C3:C{total_row - 1})")
    ws.cell(row=total_row, column=4, value=f"=SUM(D3:D{total_row - 1})")


def _write_summary_per_asset_sheet(ws, rows: list[dict[str, Any]], site_title: str) -> None:
    ws.delete_rows(1, ws.max_row)
    ws.cell(row=1, column=1, value=site_title)
    ws.cell(row=2, column=1, value="Asset Number")
    ws.cell(row=2, column=2, value="Asset Description")
    ws.cell(row=2, column=3, value="Department")
    ws.cell(row=2, column=4, value="Number of Transactions")
    ws.cell(row=2, column=5, value="SUM of Litres")
    for idx, row in enumerate(rows, 3):
        ws.cell(row=idx, column=1, value=row.get("asset_number"))
        ws.cell(row=idx, column=2, value=row.get("asset_description"))
        ws.cell(row=idx, column=3, value=row.get("department"))
        ws.cell(row=idx, column=4, value=row.get("transaction_count"))
        ws.cell(row=idx, column=5, value=row.get("litres"))


def _copy_lookup_sheet(
    source_path: str | None,
    wb: openpyxl.Workbook,
    sheet_name: str,
    required_headers: set[str] | None = None,
) -> None:
    if not source_path:
        return
    src = openpyxl.load_workbook(source_path, data_only=False)
    src_ws = None
    if sheet_name in src.sheetnames:
        src_ws = src[sheet_name]
    elif required_headers:
        for name in src.sheetnames:
            ws = src[name]
            headers = {
                str(ws.cell(1, c).value or "").strip().lower()
                for c in range(1, ws.max_column + 1)
            }
            if required_headers.issubset(headers):
                src_ws = ws
                break
    if src_ws is None:
        src_ws = src[src.sheetnames[0]]
    if sheet_name in wb.sheetnames:
        del wb[sheet_name]
    tgt = wb.create_sheet(sheet_name)
    for row in src_ws.iter_rows():
        for cell in row:
            tgt_cell = tgt.cell(row=cell.row, column=cell.column, value=cell.value)
            if cell.has_style:
                tgt_cell.font = copy(cell.font)
                tgt_cell.fill = copy(cell.fill)
                tgt_cell.border = copy(cell.border)
                tgt_cell.alignment = copy(cell.alignment)
                tgt_cell.number_format = cell.number_format


def build_summary_json(
    *,
    transactions: list[dict[str, Any]],
    review_queue: list[dict[str, Any]],
    possible_causes: list[dict[str, Any]],
    summary_per_asset: list[dict[str, Any]],
    excluded_non_mining: int,
    flagged_count: int,
    avr_sync_count: int,
    site_name: str,
) -> dict[str, Any]:
    return {
        "site_name": site_name,
        "transaction_count": len(transactions),
        "review_queue_count": len(review_queue),
        "flagged_exception_count": flagged_count,
        "avr_sync_count": avr_sync_count,
        "excluded_non_mining_count": excluded_non_mining,
        "possible_cause_groups": len(possible_causes),
        "summary_asset_count": len(summary_per_asset),
        "has_errors": False,
    }


def write_prepared_workbook(
    *,
    input_path: str,
    output_path: str,
    transactions: list[dict[str, Any]],
    review_queue: list[dict[str, Any]],
    possible_causes: list[dict[str, Any]],
    summary_per_asset: list[dict[str, Any]],
    asset_lookup_path: str | None,
    avr_sync_path: str | None,
    site_name: str,
) -> None:
    shutil.copy2(input_path, output_path)
    wb = openpyxl.load_workbook(output_path)

    for sheet_name in list(wb.sheetnames):
        if sheet_name != DETAILS_SHEET:
            del wb[sheet_name]

    _write_details_sheet(wb[DETAILS_SHEET], transactions)

    review_ws = wb.create_sheet("Transactions for Review")
    _write_review_sheet(review_ws, "Transactions for Review", review_queue)

    pcs = wb.create_sheet("Possible Cause Summary")
    _write_possible_cause_sheet(
        pcs,
        possible_causes,
        f"{site_name} - Possible Cause Summary",
    )

    spa = wb.create_sheet("Summary Per Asset")
    _write_summary_per_asset_sheet(
        spa,
        summary_per_asset,
        f"{site_name} - Summary Per Asset",
    )

    _copy_lookup_sheet(
        asset_lookup_path,
        wb,
        "Asset Info Lookup",
        {"asset number", "asset group"},
    )
    _copy_lookup_sheet(
        avr_sync_path,
        wb,
        "AVR Sync Lookup",
        {"id", "code"},
    )

    wb.save(output_path)


def infer_site_name(input_path: str) -> str:
    stem = Path(input_path).stem
    stem = stem.replace(" - Transaction Exceptions - In Context", "")
    return stem.strip() or "Site"
