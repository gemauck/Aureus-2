"""Contract tests for dispense → transactions converter."""
from __future__ import annotations

import sys
from pathlib import Path

import openpyxl
import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPT_DIR = REPO_ROOT / "scripts" / "dispense-to-transactions"
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from convert import (
    DEFAULT_GILBARCO_TEMPLATE,
    convert_row_to_gilbarco,
    convert_vehicle_row,
    format_transaction_datetime,
    load_pump_config,
)
from fleet_lookup import TRANSACTION_HEADERS
from parse_dispense import (
    DISPENSE_HEADERS,
    GILBARCO_SECTION_TITLE,
    ORIGINAL_SECTION_TITLE,
    OUTPUT_SHEET_NAME,
    build_output_filename,
    dispense_period_range,
    is_footer_row,
    normalize_asset_group,
    parse_consumption,
)


def test_footer_row_detection():
    assert is_footer_row({"Pump After": "Total Litres:", "Date & Time": None})
    assert not is_footer_row({"Date & Time": "2026-05-29 11:49:09", "Asset Number": "CAM1513"})


def test_format_transaction_datetime():
    dt, d, t = format_transaction_datetime("2026-05-29 13:51:43")
    assert dt == "29/05/2026 13:51:43"
    assert d == "29/05/2026"
    assert t == "13:51:43"


def test_parse_consumption_hours():
    meter, ctype, reading = parse_consumption("2083 hr", "0.19 L/hr")
    assert meter == "Hours"
    assert ctype == "L/HR"
    assert reading == 2083.0


def test_normalize_asset_group():
    assert normalize_asset_group("Non-Eligible") == "Not Eligible"
    assert normalize_asset_group("Eligible") == "Eligible"


def test_build_output_filename():
    assert build_output_filename(("20260529", "20260602")) == "Fuel Dispense Report 20260529 - 20260602.xlsx"
    assert build_output_filename(None) == "Fuel Dispense Report.xlsx"


def test_dispense_period_range():
    rows = [
        {"Date & Time": "2026-05-29 11:49:09"},
        {"Date & Time": "2026-06-02 14:00:00"},
    ]
    assert dispense_period_range(rows) == ("20260529", "20260602")


def test_bundled_gilbarco_template_exists():
    assert DEFAULT_GILBARCO_TEMPLATE.exists(), "gilbarco-template.xlsx must be committed in scripts/dispense-to-transactions/"


def test_convert_vehicle_row_uses_fleet_template():
    config = load_pump_config()
    fleet = {
        "CAM1513": {
            "Make": "BELL",
            "Model": "DUMP TRUCK B40D",
            "Location": "ANDRU MINING",
            "Device ID": "A MINING - CONTR",
            "Pump": "A MINING  - CONTR P1",
            "Pump Controller": "490",
            "VehicleCategory Description": "ARTICULATED DUMP TRUCK",
            "Group1": None,
            "Group2": "Not Eligible",
            "Group3": "ANDRU MINING",
            "Group4": "306080",
            "Group5": "4003338577",
            "Product Name": "DIESEL",
            "Consumption Meter": "Hours",
            "Consumption Type": "L/HR",
        }
    }
    row = {
        "Date & Time": "2026-05-29 13:51:43",
        "API ID": 1736741,
        "Fuel Pump": "OTK105M (FuelTrack)",
        "Asset Description": "BELL-B40E-ADT",
        "Asset Number": "CAM1513",
        "Asset Registration": "CAM1513",
        "Group1": "Andru Mining HDV",
        "Asset Group": "Non-Eligible",
        "Asset Owner": "ANDRU MINING",
        "Internal Order Number": 4003338577,
        "Operation": "Rehap - Haul Materials",
        "Litres": 404.739,
        "Odometer": "2083 hr",
        "Economy": "0.19 L/hr",
    }
    warnings: list[str] = []
    out = convert_vehicle_row(row, fleet, {}, config, warnings)
    assert out is not None
    assert out["Fleet ID"] == "CAM1513"
    assert out["Make"] == "BELL"
    assert out["Pump"] == "A MINING  - CONTR P1"
    assert out["Voucher Number"] == "1736741"
    assert out["Liters"] == pytest.approx(404.739)


def test_unallocated_row_always_converts():
    config = load_pump_config()
    row = {
        "Date & Time": "2026-05-29 12:13:29",
        "API ID": 1736671,
        "Fuel Pump": "OTK105M (FuelTrack)",
        "Litres": 12.044,
        "Override": "Code: 192867; Test 2nd fill; User: Greg Keague",
    }
    warnings: list[str] = []
    out = convert_row_to_gilbarco(row, {}, {}, {}, config, warnings)
    assert out["Liters"] == pytest.approx(12.044)
    assert out["Voucher Number"] == "1736671"


def test_side_by_side_workbook_layout(tmp_path):
    from convert import write_side_by_side_workbook

    dispense = [
        {
            "Date & Time": "2026-05-29 13:51:43",
            "API ID": 1,
            "Fuel Pump": "OTK105M",
            "Asset Number": "CAM1513",
            "Litres": 100.0,
        },
        {
            "Date & Time": "2026-05-29 12:13:29",
            "API ID": 2,
            "Fuel Pump": "OTK105M",
            "Litres": 12.0,
        },
    ]
    gilbarco = [
        {"Fleet ID": "CAM1513", "Liters": 100.0, "Voucher Number": "1"},
        {"Fleet ID": "OTK105M", "Liters": 12.0, "Voucher Number": "2"},
    ]
    out = tmp_path / "out.xlsx"
    write_side_by_side_workbook(dispense, gilbarco, out)

    wb = openpyxl.load_workbook(out, read_only=True, data_only=True)
    assert wb.sheetnames == [OUTPUT_SHEET_NAME]
    ws = wb[OUTPUT_SHEET_NAME]
    assert ws.cell(1, 1).value == GILBARCO_SECTION_TITLE
    dispense_start = len(TRANSACTION_HEADERS) + 2
    assert ws.cell(1, dispense_start).value == ORIGINAL_SECTION_TITLE
    assert ws.cell(2, 1).value == TRANSACTION_HEADERS[0]
    assert ws.cell(2, dispense_start).value == DISPENSE_HEADERS[0]
    assert ws.cell(3, 1).value == "CAM1513"
    assert ws.cell(3, dispense_start).value == "2026-05-29 13:51:43"
    api_col = dispense_start + DISPENSE_HEADERS.index("API ID")
    assert ws.cell(4, api_col).value == 2
    wb.close()
