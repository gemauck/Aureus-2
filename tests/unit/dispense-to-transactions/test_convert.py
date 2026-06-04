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

from convert import DEFAULT_GILBARCO_TEMPLATE, convert_vehicle_row, format_transaction_datetime, load_pump_config
from parse_dispense import (
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


def test_transaction_headers_match_reference(tmp_path):
    ref = REPO_ROOT / "tests" / "fixtures" / "dispense-to-transactions-reference.xlsx"
    if not ref.exists():
        pytest.skip("fixture workbook not bundled")

    wb = openpyxl.load_workbook(ref, read_only=True, data_only=True)
    headers = [c.value for c in wb["All Transactions"][1]]
    wb.close()
    from fleet_lookup import TRANSACTION_HEADERS

    assert list(TRANSACTION_HEADERS) == headers
