"""Convert Fuel Dispense Report rows to Transactions & Fuel Breakdown format."""
from __future__ import annotations

import json
import re
from datetime import date, datetime
from pathlib import Path
from typing import Any

import openpyxl
from openpyxl import Workbook

from fleet_lookup import TRANSACTION_HEADERS, load_reference_indexes
from parse_dispense import (
    extract_pump_code,
    is_bowser_fill,
    normalize_asset_group,
    normalize_asset_owner,
    parse_consumption,
    parse_dispense_workbook,
    split_asset_description,
)

DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent / "pump_config.json"


def _cell_str(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _parse_number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = _cell_str(value).replace(",", "")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def load_pump_config(path: str | Path | None = None) -> dict[str, Any]:
    config_path = Path(path) if path else DEFAULT_CONFIG_PATH
    with config_path.open(encoding="utf-8") as fh:
        return json.load(fh)


def format_transaction_datetime(value: Any) -> tuple[str, str, str]:
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, date):
        dt = datetime.combine(value, datetime.min.time())
    else:
        s = _cell_str(value)
        for fmt in (
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d %H:%M",
            "%d/%m/%Y %H:%M:%S",
            "%d/%m/%Y %H:%M",
        ):
            try:
                dt = datetime.strptime(s, fmt)
                break
            except ValueError:
                dt = None
        if dt is None:
            raise ValueError(f"Unrecognized date/time: {value!r}")

    display = dt.strftime("%d/%m/%Y %H:%M:%S")
    return display, dt.strftime("%d/%m/%Y"), dt.strftime("%H:%M:%S")


def _route_matches(match: dict[str, Any], row: dict[str, Any]) -> bool:
    group1 = _cell_str(row.get("Group1"))
    owner = normalize_asset_owner(row.get("Asset Owner"))
    if "group1_contains" in match and match["group1_contains"].lower() not in group1.lower():
        return False
    if "asset_owner" in match:
        expected = normalize_asset_owner(match["asset_owner"])
        if owner != expected:
            return False
    return True


def resolve_vehicle_route(
    row: dict[str, Any],
    fleet_template: dict[str, Any] | None,
    owner_routes: dict[str, dict[str, Any]],
    config: dict[str, Any],
) -> dict[str, Any]:
    owner = normalize_asset_owner(row.get("Asset Owner"))
    if fleet_template:
        return {
            "location": fleet_template.get("Location"),
            "device_id": fleet_template.get("Device ID"),
            "pump": fleet_template.get("Pump"),
            "pump_controller": fleet_template.get("Pump Controller"),
            "group1": fleet_template.get("Group1"),
        }

    for route in config.get("vehicle_routes", []):
        if _route_matches(route.get("match", {}), row):
            return {
                "location": route.get("location"),
                "device_id": route.get("device_id"),
                "pump": route.get("pump"),
                "pump_controller": route.get("pump_controller"),
                "group1": route.get("group1"),
            }

    if owner and owner in owner_routes:
        ref = owner_routes[owner]
        return {
            "location": ref.get("location"),
            "device_id": ref.get("device_id"),
            "pump": ref.get("pump"),
            "pump_controller": ref.get("pump_controller"),
            "group1": row.get("Group1"),
        }

    return {}


def convert_vehicle_row(
    row: dict[str, Any],
    fleet_by_id: dict[str, dict[str, Any]],
    owner_routes: dict[str, dict[str, Any]],
    config: dict[str, Any],
    warnings: list[str],
) -> dict[str, Any] | None:
    fleet_id = _cell_str(row.get("Asset Number")) or _cell_str(row.get("Asset Registration"))
    if not fleet_id:
        return None

    litres = _parse_number(row.get("Litres"))
    if litres is None:
        warnings.append(f"Skipping row without litres (API {_cell_str(row.get('API ID'))})")
        return None

    fleet_template = fleet_by_id.get(fleet_id)
    route = resolve_vehicle_route(row, fleet_template, owner_routes, config)

    if fleet_template:
        make = fleet_template.get("Make")
        model = fleet_template.get("Model")
        vcat = fleet_template.get("VehicleCategory Description")
        group2 = fleet_template.get("Group2")
        group3 = fleet_template.get("Group3")
        group4 = fleet_template.get("Group4")
        group5 = fleet_template.get("Group5")
        product = fleet_template.get("Product Name") or "DIESEL"
        meter = fleet_template.get("Consumption Meter")
        ctype = fleet_template.get("Consumption Type")
        group1 = route.get("group1") if route.get("group1") is not None else fleet_template.get("Group1")
    else:
        make, model = split_asset_description(row.get("Asset Description"))
        vcat = _cell_str(row.get("Operation")) or None
        group2 = normalize_asset_group(row.get("Asset Group")) or None
        group3 = normalize_asset_owner(row.get("Asset Owner")) or None
        group4 = row.get("Gilbarco Unique Asset ID")
        group5 = row.get("Internal Order Number")
        product = "DIESEL"
        meter, ctype, _ = parse_consumption(row.get("Odometer"), row.get("Economy"))
        group1 = route.get("group1") if route.get("group1") is not None else row.get("Group1")
        warnings.append(f"No fleet template for {fleet_id}; using dispense-derived fields")

    meter, ctype, reading = parse_consumption(row.get("Odometer"), row.get("Economy"))
    if fleet_template and fleet_template.get("Consumption Meter"):
        meter = fleet_template.get("Consumption Meter") or meter
        ctype = fleet_template.get("Consumption Type") or ctype

    tx_dt, tx_date, tx_time = format_transaction_datetime(row.get("Date & Time"))
    location = route.get("location") or (fleet_template or {}).get("Location") or group3
    if not route.get("pump"):
        warnings.append(f"Missing pump route for {fleet_id} ({group3})")

    return {
        "Fleet ID": fleet_id,
        "Registration Number": _cell_str(row.get("Asset Registration")) or fleet_id,
        "Make": make,
        "Model": model,
        "TransactionDateTime": tx_dt,
        "Date": tx_date,
        "Time": tx_time,
        "Liters": litres,
        "Location": location,
        "Device ID": route.get("device_id"),
        "Pump": route.get("pump"),
        "Fleet Type": (fleet_template or {}).get("Fleet Type"),
        "VehicleCategory Description": vcat,
        "Responsibility Code": (fleet_template or {}).get("Responsibility Code"),
        "BusinessRevenue Code": (fleet_template or {}).get("BusinessRevenue Code"),
        "Product Name": product,
        "Cost Centre": (fleet_template or {}).get("Cost Centre"),
        "TaxRebate Code": (fleet_template or {}).get("TaxRebate Code"),
        "Consumption Meter": meter,
        "Consumption Type": ctype,
        "Hours/OD reading": reading,
        "Group1": group1,
        "Group2": group2 or normalize_asset_group(row.get("Asset Group")) or None,
        "Group3": group3,
        "Group4": group4 if group4 is not None else (fleet_template or {}).get("Group4"),
        "Group5": group5 if group5 is not None else (fleet_template or {}).get("Group5"),
        "Voucher Number": str(row.get("API ID")) if row.get("API ID") is not None else None,
        "Pump Controller": route.get("pump_controller"),
        "Transaction Plate": fleet_id,
        "Operator ID": _cell_str(row.get("User Tag")) or None,
        "Operator Name": _cell_str(row.get("Operator")) or None,
        "_is_bowser": False,
    }


def convert_bowser_row(
    row: dict[str, Any],
    bowser_by_fleet: dict[str, dict[str, Any]],
    config: dict[str, Any],
) -> dict[str, Any] | None:
    litres = _parse_number(row.get("Litres"))
    if litres is None:
        return None

    aliases = config.get("fuel_pump_aliases", {})
    pump_code = extract_pump_code(row.get("Fuel Pump"), aliases)
    if not pump_code:
        return None

    template_cfg = config.get("bowser_template", {})
    ref = bowser_by_fleet.get(pump_code, {})

    tx_dt, tx_date, tx_time = format_transaction_datetime(row.get("Date & Time"))

    return {
        "Fleet ID": pump_code,
        "Registration Number": pump_code,
        "Make": ref.get("Make") or template_cfg.get("make"),
        "Model": ref.get("Model") or template_cfg.get("model"),
        "TransactionDateTime": tx_dt,
        "Date": tx_date,
        "Time": tx_time,
        "Liters": litres,
        "Location": ref.get("Location") or template_cfg.get("location"),
        "Device ID": ref.get("Device ID") or template_cfg.get("device_id"),
        "Pump": ref.get("Pump") or template_cfg.get("pump"),
        "Fleet Type": ref.get("Fleet Type"),
        "VehicleCategory Description": ref.get("VehicleCategory Description")
        or template_cfg.get("vehicle_category"),
        "Responsibility Code": ref.get("Responsibility Code")
        or template_cfg.get("responsibility_code"),
        "BusinessRevenue Code": ref.get("BusinessRevenue Code")
        or template_cfg.get("business_revenue_code"),
        "Product Name": ref.get("Product Name") or template_cfg.get("product_name"),
        "Cost Centre": ref.get("Cost Centre") or template_cfg.get("cost_centre"),
        "TaxRebate Code": ref.get("TaxRebate Code") or template_cfg.get("tax_rebate_code"),
        "Consumption Meter": ref.get("Consumption Meter") or template_cfg.get("consumption_meter"),
        "Consumption Type": ref.get("Consumption Type") or template_cfg.get("consumption_type"),
        "Hours/OD reading": 0.0,
        "Group1": ref.get("Group1") or template_cfg.get("group1"),
        "Group2": ref.get("Group2") or template_cfg.get("group2"),
        "Group3": ref.get("Group3") or template_cfg.get("group3"),
        "Group4": ref.get("Group4") or template_cfg.get("group4"),
        "Group5": ref.get("Group5") or template_cfg.get("group5"),
        "Voucher Number": str(row.get("API ID")) if row.get("API ID") is not None else None,
        "Pump Controller": ref.get("Pump Controller") or template_cfg.get("pump_controller"),
        "Transaction Plate": pump_code,
        "Operator ID": None,
        "Operator Name": _cell_str(row.get("Operator")) or None,
        "_is_bowser": True,
    }


def convert_dispense_rows(
    dispense_rows: list[dict[str, Any]],
    fleet_by_id: dict[str, dict[str, Any]],
    owner_routes: dict[str, dict[str, Any]],
    bowser_by_fleet: dict[str, dict[str, Any]],
    config: dict[str, Any],
    *,
    include_override_fills: bool = False,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str]]:
    """Return (all_transactions, excl_bowsers, warnings)."""
    warnings: list[str] = []
    all_rows: list[dict[str, Any]] = []

    for row in dispense_rows:
        if row.get("Asset Number") or row.get("Asset Registration"):
            converted = convert_vehicle_row(row, fleet_by_id, owner_routes, config, warnings)
            if converted:
                all_rows.append(converted)
            continue

        if not include_override_fills and not is_bowser_fill(row):
            api = _cell_str(row.get("API ID"))
            if api:
                warnings.append(f"Skipped non-asset override row API {api}")
            continue

        if is_bowser_fill(row):
            converted = convert_bowser_row(row, bowser_by_fleet, config)
            if converted:
                all_rows.append(converted)
            continue

        if include_override_fills:
            converted = convert_bowser_row(row, bowser_by_fleet, config)
            if converted:
                all_rows.append(converted)

    excl = [r for r in all_rows if not r.get("_is_bowser")]
    for r in all_rows:
        r.pop("_is_bowser", None)
    for r in excl:
        r.pop("_is_bowser", None)
    return all_rows, excl, warnings


def _copy_sheet_structure(template_ws, target_ws) -> None:
    if template_ws.max_row >= 1:
        for col, cell in enumerate(template_ws[1], start=1):
            target_ws.cell(row=1, column=col, value=cell.value)


def _write_rows(ws, rows: list[dict[str, Any]]) -> None:
    if ws.max_row > 1:
        ws.delete_rows(2, ws.max_row - 1)
    for ri, row in enumerate(rows, start=2):
        for ci, header in enumerate(TRANSACTION_HEADERS, start=1):
            ws.cell(row=ri, column=ci, value=row.get(header))


def write_output_workbook(
    template_path: Path,
    all_rows: list[dict[str, Any]],
    excl_rows: list[dict[str, Any]],
    output_path: Path,
) -> None:
    template_wb = openpyxl.load_workbook(template_path)
    out_wb = Workbook()
    out_wb.remove(out_wb.active)

    for sheet_name in template_wb.sheetnames:
        src_ws = template_wb[sheet_name]
        dst_ws = out_wb.create_sheet(sheet_name)
        if sheet_name == "All Transactions":
            _copy_sheet_structure(src_ws, dst_ws)
            _write_rows(dst_ws, all_rows)
        elif sheet_name == "Transactions Exl. Bowsers":
            _copy_sheet_structure(src_ws, dst_ws)
            _write_rows(dst_ws, excl_rows)
        else:
            for row in src_ws.iter_rows(values_only=False):
                for cell in row:
                    dst_ws[cell.coordinate].value = cell.value

    template_wb.close()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    out_wb.save(output_path)
    out_wb.close()


def convert_workbook(
    dispense_path: str | Path,
    reference_path: str | Path,
    output_path: str | Path,
    *,
    template_path: str | Path | None = None,
    pump_config_path: str | Path | None = None,
    include_override_fills: bool = False,
) -> dict[str, Any]:
    dispense_path = Path(dispense_path)
    reference_path = Path(reference_path)
    output_path = Path(output_path)
    template_path = Path(template_path) if template_path else reference_path

    config = load_pump_config(pump_config_path)
    dispense_rows = parse_dispense_workbook(dispense_path)
    fleet_by_id, owner_routes, bowser_by_fleet = load_reference_indexes(reference_path)
    all_rows, excl_rows, warnings = convert_dispense_rows(
        dispense_rows,
        fleet_by_id,
        owner_routes,
        bowser_by_fleet,
        config,
        include_override_fills=include_override_fills,
    )
    write_output_workbook(template_path, all_rows, excl_rows, output_path)

    return {
        "source": str(dispense_path.resolve()),
        "reference": str(reference_path.resolve()),
        "output": str(output_path.resolve()),
        "dispense_rows": len(dispense_rows),
        "all_transactions": len(all_rows),
        "transactions_excl_bowsers": len(excl_rows),
        "bowser_rows": len(all_rows) - len(excl_rows),
        "warnings": warnings,
    }
