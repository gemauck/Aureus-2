"""Contract tests: each audit check must fire on a known-bad synthetic row."""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "scripts", "fuel-refund-report-audit"))

from parse_workbook import ParsedWorkbook  # noqa: E402
from rules import (  # noqa: E402
    check_auto_created_asset_suspect,
    check_bowser_low_litre,
    check_duplicate_transaction,
    check_mining_eligible_missing_operator,
    check_negative_odo_eligible,
    check_refund_rate_summary,
    load_config,
    run_all_rules,
)

from test_rules import _row  # noqa: E402


@pytest.fixture
def cfg():
    return load_config()


def _parsed(rows):
    return ParsedWorkbook(source_path="contract", combined_rows=rows)


def test_contract_negative_odo(cfg):
    rows = [
        _row(
            **{
                "Transaction ID": "CONTRACT-ODO",
                "Eligible L": 10,
                "Total Usage Km/Hr": "-100.0 hr",
                "Total Fuel Used (L)": 50,
            }
        )
    ]
    ids = {f.check_id for f in check_negative_odo_eligible(rows, cfg)}
    assert "negative_odo_eligible" in ids


def test_contract_duplicate(cfg):
    dup = _row(**{"Transaction ID": "CONTRACT-DUP-1", "Date & Time": "2026-04-01 12:00:00"})
    rows = [dup, {**dup, "Transaction ID": "CONTRACT-DUP-2"}]
    ids = {f.check_id for f in check_duplicate_transaction(rows, cfg)}
    assert "duplicate_transaction" in ids


def test_contract_mining_operator_skips_zero_litres(cfg):
    rows = [
        _row(
            **{
                "Transaction ID": "CONTRACT-ZERO-OP",
                "Operator": None,
                "Fuel Dispensed or Received (L)": 0,
                "Eligible L": 0,
            }
        )
    ]
    assert check_mining_eligible_missing_operator(rows, cfg) == []


def test_contract_mining_operator_flags_dispense(cfg):
    rows = [_row(**{"Transaction ID": "CONTRACT-OP", "Operator": None})]
    ids = {f.check_id for f in check_mining_eligible_missing_operator(rows, cfg)}
    assert "mining_eligible_missing_operator" in ids


def test_contract_refund_rate_skipped_by_default():
    row = _row(
        **{
            "Transaction ID": "CONTRACT-RATE",
            "Refund Price": 9.99,
            "Eligible L": 100,
            "Refund Total": 100,
        }
    )
    parsed = _parsed([row])
    parsed.refund_rates = [{"label": "Rate", "rate": 3.66, "excel_row": 1}]
    findings, skipped = run_all_rules(parsed, require_refund_rate_check=False)
    assert "refund_rate_summary" in skipped
    assert not any(f.check_id == "refund_rate_summary" for f in findings)


def test_contract_refund_rate_only_with_claim(cfg):
    rows = [
        _row(
            **{
                "Transaction ID": "CONTRACT-RATE-CLAIM",
                "Refund Price": 9.99,
                "Eligible L": 100,
                "Refund Total": 100,
            }
        ),
        _row(
            **{
                "Transaction ID": "CONTRACT-RATE-NO-CLAIM",
                "Refund Price": 9.99,
                "Eligible L": 0,
                "Refund Total": 0,
                "Eligible Volume (L) (Claimable % of Total)": 0,
            }
        ),
    ]
    parsed = _parsed(rows)
    parsed.refund_rates = [{"label": "Rate", "rate": 3.66, "excel_row": 1}]
    findings = check_refund_rate_summary(rows, parsed, cfg)
    tids = {f.transaction_id for f in findings}
    assert "CONTRACT-RATE-CLAIM" in tids
    assert "CONTRACT-RATE-NO-CLAIM" not in tids


def test_contract_bowser_low_litre(cfg):
    rows = [
        _row(
            **{
                "Transaction ID": "CONTRACT-BOWSER",
                "Asset Description": "MOBILE-BOWSER TEST",
                "Fuel Dispensed or Received (L)": -10,
            }
        )
    ]
    ids = {f.check_id for f in check_bowser_low_litre(rows, cfg)}
    assert "bowser_low_litre" in ids


def test_contract_bowser_consecutive_total_above_threshold_not_flagged(cfg):
    rows = [
        _row(
            **{
                "Transaction ID": "CONTRACT-BOWSER-A",
                "Date & Time": "2026-04-01 10:00:00",
                "Asset Number": "BOWSER-1",
                "Asset Description": "MOBILE-BOWSER TEST",
                "Fuel Dispensed or Received (L)": -30,
            }
        ),
        _row(
            **{
                "Transaction ID": "CONTRACT-BOWSER-B",
                "Date & Time": "2026-04-01 10:30:00",
                "Asset Number": "BOWSER-1",
                "Asset Description": "MOBILE-BOWSER TEST",
                "Fuel Dispensed or Received (L)": -25,
            }
        ),
    ]
    findings = check_bowser_low_litre(rows, cfg)
    assert findings == []


def test_contract_bowser_consecutive_total_below_threshold_flagged(cfg):
    rows = [
        _row(
            **{
                "Transaction ID": "CONTRACT-BOWSER-C",
                "Date & Time": "2026-04-01 10:00:00",
                "Asset Number": "BOWSER-2",
                "Asset Description": "MOBILE-BOWSER TEST",
                "Fuel Dispensed or Received (L)": -20,
            }
        ),
        _row(
            **{
                "Transaction ID": "CONTRACT-BOWSER-D",
                "Date & Time": "2026-04-01 10:30:00",
                "Asset Number": "BOWSER-2",
                "Asset Description": "MOBILE-BOWSER TEST",
                "Fuel Dispensed or Received (L)": -15,
            }
        ),
    ]
    findings = check_bowser_low_litre(rows, cfg)
    tids = {f.transaction_id for f in findings}
    assert "CONTRACT-BOWSER-C" in tids
    assert "CONTRACT-BOWSER-D" in tids


def test_contract_auto_created(cfg):
    rows = [
        _row(
            **{
                "Transaction ID": "CONTRACT-AUTO",
                "Asset Number": "AUTO-CONTRACT-1",
                "Asset Description": "test",
            }
        )
    ]
    ids = {f.check_id for f in check_auto_created_asset_suspect(rows, cfg)}
    assert "auto_created_asset_suspect" in ids
