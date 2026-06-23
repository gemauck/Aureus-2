"""Unit tests for dispense exception prep."""
from __future__ import annotations

from datetime import datetime

import pytest

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts" / "dispense-exception-audit"))

from enrichment import is_mining_eligible, should_escalate
from exception_rules import RuleFlags, compute_flags_for_asset


def test_is_mining_eligible_excludes_non_mining():
    assert is_mining_eligible({"asset_group": "Mining- Eligible", "refund_eligibility": "Eligible"})
    assert not is_mining_eligible(
        {"asset_group": "Non Mining - Non Eligible", "refund_eligibility": "Non-Eligible"}
    )


def test_consecutive_dispense_flags():
    rows = [
        {
            "transaction_id": "a1",
            "date_time": datetime(2026, 5, 1, 10, 0),
            "opening_odo_num": 100.0,
            "closing_odo_num": 100.0,
            "total_usage_num": 0.0,
            "litres": 500.0,
            "tank_size_l": 2000.0,
        },
        {
            "transaction_id": "a2",
            "date_time": datetime(2026, 5, 1, 10, 30),
            "opening_odo_num": 100.0,
            "closing_odo_num": 110.0,
            "total_usage_num": 10.0,
            "litres": 400.0,
            "tank_size_l": 2000.0,
        },
    ]
    computed = compute_flags_for_asset(rows)
    assert len(computed) == 2
    assert computed[1].flags.consec_60
    assert computed[1].flags.consec_120
    assert computed[0].flags.odo_non_positive


def test_initial_dispense_escalates():
    row = {
        "transaction_id": "x1",
        "refund_eligibility": "Eligible",
        "total_usage_num": 5.0,
        "litres": 100.0,
    }
    flags = RuleFlags(initial_dispense=True)
    from exception_rules import ComputedTransaction

    comp = ComputedTransaction("x1", "A1", None, flags)
    assert should_escalate(row, comp)
