"""Exception rule engine for dispense exception workbooks."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

REASON_CONSEC_60 = "Consecutive dispenses within 60 minutes"
REASON_CONSEC_120 = "Consecutive dispenses within 120 minutes"
REASON_ODO_NON_POS = "Odo difference <= 0"
REASON_FILL_OUTSIDE = "Fill outside of one hour from start"
REASON_ODO_GT_50 = "Odo difference > 50 hrs"
REASON_ODO_JUMP = (
    "Odo difference > 50 hrs, Consecutive dispenses within 60 minutes, "
    "Actual time elapsed between dispenses < Odo time elapsed"
)
REASON_ODO_JUMP_120 = (
    "Odo difference > 50 hrs, Consecutive dispenses within 120 minutes, "
    "Actual time elapsed between dispenses < Odo time elapsed"
)
REASON_OVER_TANK = "Cumulative litres > tank size during consecutive dispenses"


@dataclass
class RuleFlags:
    consec_60: bool = False
    consec_120: bool = False
    odo_non_positive: bool = False
    fill_outside_hour: bool = False
    odo_jump_50: bool = False
    odo_gt_50: bool = False
    over_tank_cumulative: bool = False
    initial_dispense: bool = False
    meter_reset: bool = False
    over_tank_detail: str | None = None

    def reason_60_parts(self) -> list[str]:
        if self.odo_gt_50:
            return [REASON_ODO_GT_50]
        parts: list[str] = []
        if self.fill_outside_hour:
            parts.append(REASON_FILL_OUTSIDE)
        if self.odo_non_positive:
            parts.append(REASON_ODO_NON_POS)
        if self.consec_60:
            parts.append(REASON_CONSEC_60)
        if self.odo_jump_50:
            return [REASON_ODO_JUMP]
        if self.over_tank_detail:
            parts.append(self.over_tank_detail)
        return parts

    def reason_120_parts(self) -> list[str]:
        if self.odo_gt_50:
            return [REASON_ODO_GT_50]
        parts: list[str] = []
        if self.odo_non_positive:
            parts.append(REASON_ODO_NON_POS)
        if self.consec_120:
            parts.append(REASON_CONSEC_120)
        if self.odo_jump_50:
            return [REASON_ODO_JUMP_120]
        if self.over_tank_detail:
            parts.append(
                self.over_tank_detail.replace("60 minutes", "120 minutes")
            )
        return parts

    def reason_60(self) -> str | None:
        parts = self.reason_60_parts()
        return ", ".join(parts) if parts else None

    def reason_120(self) -> str | None:
        parts = self.reason_120_parts()
        return ", ".join(parts) if parts else None

    def rule_ids(self) -> set[str]:
        ids: set[str] = set()
        if self.consec_60:
            ids.add("consec_60")
        if self.consec_120:
            ids.add("consec_120")
        if self.odo_non_positive:
            ids.add("odo_non_positive")
        if self.fill_outside_hour:
            ids.add("fill_outside_hour")
        if self.odo_jump_50:
            ids.add("odo_jump_50")
        if self.odo_gt_50:
            ids.add("odo_gt_50")
        if self.over_tank_cumulative:
            ids.add("over_tank_cumulative")
        if self.initial_dispense:
            ids.add("initial_dispense")
        if self.meter_reset:
            ids.add("meter_reset")
        return ids

    def is_routine_split_fill(self) -> bool:
        return (
            self.odo_non_positive
            and self.consec_60
            and not self.fill_outside_hour
            and not self.odo_jump_50
            and not self.over_tank_cumulative
        )


@dataclass
class ComputedTransaction:
    transaction_id: str
    asset_number: str | None
    date_time: datetime | None
    flags: RuleFlags = field(default_factory=RuleFlags)
    minutes_since_previous: float | None = None
    minutes_since_batch_start: float | None = None
    batch_start_time: datetime | None = None
    cumulative_litres_in_batch: float | None = None


def _minutes_between(a: datetime | None, b: datetime | None) -> float | None:
    if not a or not b:
        return None
    return abs((b - a).total_seconds()) / 60.0


def _usage_value(record: dict[str, Any]) -> float | None:
    if record.get("total_usage_num") is not None:
        return record["total_usage_num"]
    opening = record.get("opening_odo_num")
    closing = record.get("closing_odo_num")
    if opening is not None and closing is not None:
        return closing - opening
    return None


def compute_flags_for_asset(asset_rows: list[dict[str, Any]]) -> list[ComputedTransaction]:
    """Apply exception rules to chronologically sorted rows for one asset."""
    rows = sorted(asset_rows, key=lambda r: r.get("date_time") or datetime.min)
    results: list[ComputedTransaction] = []
    batch_start_idx: int | None = None
    batch_start_time: datetime | None = None

    for i, row in enumerate(rows):
        txn_id = str(row.get("transaction_id") or "")
        dt = row.get("date_time")
        flags = RuleFlags()

        opening = row.get("opening_odo_num")
        if opening is not None and opening == 0:
            flags.initial_dispense = True

        usage = _usage_value(row)
        meter_type = str(row.get("meter_type") or "").lower()
        if usage is not None and usage > 50 and ("hr" in meter_type or not meter_type):
            flags.odo_gt_50 = True
        if usage is not None and usage <= 0:
            flags.odo_non_positive = True

        closing = row.get("closing_odo_num")
        if opening is not None and opening > 0 and closing == 0:
            flags.meter_reset = True
        if usage is not None and usage < -50:
            flags.meter_reset = True

        prev = rows[i - 1] if i > 0 else None
        next_row = rows[i + 1] if i + 1 < len(rows) else None
        minutes_since_prev = _minutes_between(
            prev.get("date_time") if prev else None, dt
        )
        minutes_to_next = _minutes_between(
            dt, next_row.get("date_time") if next_row else None
        )

        if prev and minutes_since_prev is not None:
            if minutes_since_prev <= 120:
                flags.consec_120 = True
            if minutes_since_prev <= 60:
                flags.consec_60 = True
                if batch_start_idx is None:
                    batch_start_idx = i - 1
                    batch_start_time = prev.get("date_time")
            else:
                batch_start_idx = i
                batch_start_time = dt
        else:
            batch_start_idx = i
            batch_start_time = dt

        if next_row and minutes_to_next == 0:
            next_usage = next_row.get("total_usage_num") or 0
            if flags.odo_non_positive and next_usage > 0:
                flags.consec_60 = True
                flags.consec_120 = True

        minutes_since_batch = _minutes_between(batch_start_time, dt)

        if prev and minutes_since_prev is not None:
            if 60 < minutes_since_prev <= 120:
                flags.fill_outside_hour = True
            elif (
                flags.consec_60
                and minutes_since_batch is not None
                and minutes_since_batch > 60
            ):
                flags.fill_outside_hour = True

        if prev and flags.consec_60 and usage is not None and usage > 50:
            if minutes_since_prev is not None and minutes_since_prev < usage * 60:
                flags.odo_jump_50 = True

        tank = row.get("tank_size_l")
        cumulative: float | None = None
        if tank and batch_start_idx is not None and flags.consec_60:
            batch_rows = rows[batch_start_idx : i + 1]
            cumulative = sum(float(r.get("litres") or 0) for r in batch_rows)
            if cumulative > float(tank) and flags.odo_non_positive:
                flags.over_tank_cumulative = True
                flags.over_tank_detail = (
                    f"Cumulative litres > tank size during consecutive dispenses; "
                    f"{cumulative:.1f} L into a {float(tank):.0f} L tank, "
                    f"{REASON_ODO_NON_POS}, {REASON_CONSEC_60}"
                )

        results.append(
            ComputedTransaction(
                transaction_id=txn_id,
                asset_number=row.get("asset_number"),
                date_time=dt,
                flags=flags,
                minutes_since_previous=minutes_since_prev,
                minutes_since_batch_start=minutes_since_batch,
                batch_start_time=batch_start_time,
                cumulative_litres_in_batch=cumulative,
            )
        )

    return results


def compute_all(transactions: list[dict[str, Any]]) -> dict[str, ComputedTransaction]:
    by_asset: dict[str, list[dict[str, Any]]] = {}
    for row in transactions:
        asset = str(row.get("asset_number") or "UNKNOWN")
        by_asset.setdefault(asset, []).append(row)

    out: dict[str, ComputedTransaction] = {}
    for asset_rows in by_asset.values():
        for computed in compute_flags_for_asset(asset_rows):
            out[computed.transaction_id] = computed
    return out


def normalize_reason_text(text: str | None) -> set[str]:
    if not text:
        return set()
    return {part.strip().lower() for part in str(text).split(",") if part.strip()}


def compare_reason(reported: str | None, expected: str | None) -> dict[str, Any]:
    reported_set = normalize_reason_text(reported)
    expected_set = normalize_reason_text(expected)
    return {
        "match": reported_set == expected_set,
        "reported": reported,
        "expected": expected,
        "missing": sorted(expected_set - reported_set),
        "extra": sorted(reported_set - expected_set),
    }


def match_rate(
    transactions: list[dict[str, Any]],
    computed: dict[str, ComputedTransaction],
    column: str,
) -> dict[str, Any]:
    mismatches: list[dict[str, Any]] = []
    matched = 0
    total_flagged = 0

    for row in transactions:
        txn_id = str(row.get("transaction_id") or "")
        comp = computed.get(txn_id)
        if not comp:
            continue
        expected = comp.flags.reason_60() if column == "exception_60" else comp.flags.reason_120()
        reported = row.get(column)
        if not expected and not reported:
            continue
        total_flagged += 1
        cmp = compare_reason(reported, expected)
        if cmp["match"]:
            matched += 1
        else:
            mismatches.append({"transaction_id": txn_id, **cmp})

    pct = 100.0 if total_flagged == 0 else round(100.0 * matched / total_flagged, 1)
    return {
        "total_flagged": total_flagged,
        "matched": matched,
        "match_pct": pct,
        "mismatches": mismatches[:50],
    }
