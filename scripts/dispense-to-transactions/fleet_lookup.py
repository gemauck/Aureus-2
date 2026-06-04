"""Build fleet and owner routing indexes from a reference Transactions workbook."""
from __future__ import annotations

from pathlib import Path
from typing import Any

import openpyxl

TRANSACTION_HEADERS = (
    "Fleet ID",
    "Registration Number",
    "Make",
    "Model",
    "TransactionDateTime",
    "Date",
    "Time",
    "Liters",
    "Location",
    "Device ID",
    "Pump",
    "Fleet Type",
    "VehicleCategory Description",
    "Responsibility Code",
    "BusinessRevenue Code",
    "Product Name",
    "Cost Centre",
    "TaxRebate Code",
    "Consumption Meter",
    "Consumption Type",
    "Hours/OD reading",
    "Group1",
    "Group2",
    "Group3",
    "Group4",
    "Group5",
    "Voucher Number",
    "Pump Controller",
    "Transaction Plate",
    "Operator ID",
    "Operator Name",
)

FLEET_FIELDS = (
    "Make",
    "Model",
    "Location",
    "Device ID",
    "Pump",
    "Pump Controller",
    "VehicleCategory Description",
    "Group1",
    "Group2",
    "Group3",
    "Group4",
    "Group5",
    "Product Name",
    "Consumption Meter",
    "Consumption Type",
    "Responsibility Code",
    "BusinessRevenue Code",
    "Cost Centre",
    "TaxRebate Code",
    "Fleet Type",
)


def _cell_str(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def load_reference_indexes(
    path: str | Path,
) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    """Return (fleet_by_id, owner_pump_routes, bowser_by_fleet)."""
    path = Path(path)
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sheet = (
        "All Transactions"
        if "All Transactions" in wb.sheetnames
        else wb.sheetnames[-1]
    )
    ws = wb[sheet]
    header = [_cell_str(c) for c in next(ws.iter_rows(min_row=1, max_row=1, values_only=True), ())]

    fleet_by_id: dict[str, dict[str, Any]] = {}
    owner_routes: dict[str, dict[str, Any]] = {}
    bowser_by_fleet: dict[str, dict[str, Any]] = {}

    for cells in ws.iter_rows(min_row=2, values_only=True):
        row = {header[i]: cells[i] if i < len(cells) else None for i in range(len(header))}
        fleet_id = _cell_str(row.get("Fleet ID"))
        if not fleet_id:
            continue

        vcat = _cell_str(row.get("VehicleCategory Description"))
        if vcat == "BOWSER":
            if fleet_id not in bowser_by_fleet:
                bowser_by_fleet[fleet_id] = {k: row.get(k) for k in TRANSACTION_HEADERS}
            continue

        if fleet_id not in fleet_by_id:
            fleet_by_id[fleet_id] = {field: row.get(field) for field in FLEET_FIELDS}

        owner = _cell_str(row.get("Group3"))
        pump = _cell_str(row.get("Pump"))
        if owner and pump and owner not in owner_routes:
            owner_routes[owner] = {
                "location": row.get("Location"),
                "device_id": row.get("Device ID"),
                "pump": row.get("Pump"),
                "pump_controller": row.get("Pump Controller"),
            }

    wb.close()
    return fleet_by_id, owner_routes, bowser_by_fleet
