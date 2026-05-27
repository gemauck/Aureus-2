"""Unit tests for fuel refund report audit rules."""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "scripts", "fuel-refund-report-audit"))

from parse_workbook import ParsedWorkbook  # noqa: E402
from rules import (  # noqa: E402
    check_duplicate_transaction,
    check_initial_dispense_no_claim,
    check_mining_eligible_missing_claim,
    check_refund_total_math,
    has_non_eligible_reason,
    is_mining_eligible_row as rules_is_mining,
    load_config,
)


def _row(**kwargs):
    base = {
        "_sheet": "Combined Fuel Transactions",
        "_excel_row": 10,
        "Transaction Type": "DISPENSE",
        "Date & Time": "2026-04-01 10:00:00",
        "Asset Number": "A1",
        "Fuel Pump": "P1",
        "Fuel Dispensed or Received (L)": -100,
        "Asset Group": "Mining - Eligible",
        "Operator": "Op",
        "Location": "Pit",
        "Operation Description / Comment": "Coal recovery drilling",
    }
    base.update(kwargs)
    return base


@pytest.fixture
def cfg():
    return load_config()


def test_mining_eligible_filter():
    assert rules_is_mining("Mining - Eligible") is True
    assert rules_is_mining("Non-Mining - Non-Eligible") is False
    assert rules_is_mining("Non-Mining - Eligible") is False


def test_initial_dispense_no_claim_flags_claim(cfg):
    rows = [
        _row(
            **{
                "Transaction Type": "INITIAL-DISPENSE",
                "Refund Total": 10,
                "Eligible Volume (L) (Claimable % of Total)": None,
            }
        )
    ]
    findings = check_initial_dispense_no_claim(rows, cfg)
    assert len(findings) == 1
    assert findings[0].check_id == "initial_dispense_no_claim"


def test_duplicate_transaction(cfg):
    dup = _row()
    rows = [dup, dict(dup, _excel_row=11)]
    findings = check_duplicate_transaction(rows, cfg)
    assert len(findings) == 2
    assert all(f.check_id == "duplicate_transaction" for f in findings)


def test_mining_eligible_missing_claim_with_exception(cfg):
    rows = [
        _row(
            **{
                "Refund Total": None,
                "Eligible Volume (L) (Claimable % of Total)": None,
                "Eligible L": None,
                "Operation Description / Comment": "deemed non-eligible due to odometer",
            }
        )
    ]
    assert has_non_eligible_reason(rows[0]["Operation Description / Comment"], cfg)
    findings = check_mining_eligible_missing_claim(rows, cfg)
    assert len(findings) == 0


def test_mining_eligible_missing_claim_without_exception(cfg):
    rows = [
        _row(
            **{
                "Refund Total": None,
                "Eligible Volume (L) (Claimable % of Total)": None,
                "Eligible L": None,
                "Operation Description / Comment": "Valid mining operation",
            }
        )
    ]
    findings = check_mining_eligible_missing_claim(rows, cfg)
    assert len(findings) == 1


def test_refund_total_math_mismatch(cfg):
    rows = [
        _row(
            **{
                "Eligible Volume (L) (Claimable % of Total)": 100,
                "Refund Price": 2.622,
                "Refund Total": 500,
            }
        )
    ]
    findings = check_refund_total_math(rows, cfg)
    assert len(findings) == 1
    assert findings[0].check_id == "refund_total_math"


def test_refund_total_math_ok(cfg):
    rows = [
        _row(
            **{
                "Eligible Volume (L) (Claimable % of Total)": 100,
                "Refund Price": 2.622,
                "Refund Total": 262.2,
            }
        )
    ]
    findings = check_refund_total_math(rows, cfg)
    assert len(findings) == 0


def test_parsed_workbook_empty_combined():
    parsed = ParsedWorkbook(source_path="test.xlsx", combined_rows=[])
    assert parsed.combined_rows == []
