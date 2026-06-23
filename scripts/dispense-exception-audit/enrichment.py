"""Enrich dispense exception transactions with lookups, economy, and review flags."""
from __future__ import annotations

import re
from typing import Any

from exception_rules import ComputedTransaction, compute_all

DEFAULT_ECONOMY_VARIANCE_THRESHOLD = 0.6
MINING_NON_ELIGIBLE_MARKERS = ("non mining", "non-eligible")


def is_mining_eligible(row: dict[str, Any]) -> bool:
    group = str(row.get("asset_group") or "").lower()
    eligibility = str(row.get("refund_eligibility") or "").strip()
    if any(marker in group for marker in MINING_NON_ELIGIBLE_MARKERS):
        return False
    if eligibility.lower() == "non-eligible":
        return False
    return True


def _economy_type(meter_type: str | None) -> str | None:
    if not meter_type:
        return None
    text = str(meter_type).lower()
    if "hr" in text:
        return "L/hr"
    if "km" in text:
        return "L/km"
    return str(meter_type)


def _compute_economy(row: dict[str, Any]) -> float | None:
    litres = row.get("litres")
    usage = row.get("total_usage_num")
    if litres is None or usage is None or usage == 0:
        return None
    meter = str(row.get("meter_type") or "").lower()
    if "km" in meter:
        return usage / litres if litres else None
    return litres / usage


def _parse_avg_economy(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(",", "")
    for token in text.split():
        try:
            return float(token)
        except ValueError:
            continue
    return None


def _pct_variance(economy: float | None, avg: float | None) -> float | None:
    if economy is None or avg is None or avg == 0:
        return None
    return (economy - avg) / avg


def apply_asset_lookup(
    row: dict[str, Any], lookup: dict[str, dict[str, Any]]
) -> None:
    asset = str(row.get("asset_number") or "").strip()
    info = lookup.get(asset)
    if not info:
        return
    if not row.get("asset_tag") and info.get("asset_tag"):
        row["asset_tag"] = info["asset_tag"]
    if not row.get("department") and info.get("department"):
        row["department"] = info["department"]
    if row.get("avg_economy_180d") is None and info.get("avg_economy_180d") is not None:
        row["avg_economy_180d"] = info["avg_economy_180d"]
    if row.get("tank_size_l") is None and info.get("tank_size_l") is not None:
        try:
            row["tank_size_l"] = float(info["tank_size_l"])
        except (TypeError, ValueError):
            pass
    if not row.get("meter_type") and info.get("meter_type"):
        row["meter_type"] = info["meter_type"]


def _tag_digits(tag: Any) -> str | None:
    if tag is None:
        return None
    digits = re.sub(r"\D", "", str(tag))
    return digits or None


def build_avr_match_index(avr_rows: list[dict[str, Any]]) -> dict[str, set[str]]:
    """Map transaction id suffix / PAN digits / asset+date keys to AVR sync hits."""
    by_suffix: dict[str, set[str]] = {}
    for avr in avr_rows:
        avr_id = avr.get("avr_id")
        if avr_id:
            by_suffix.setdefault(avr_id, set()).add(avr_id)
        trans_num = avr.get("trans_num")
        if trans_num:
            by_suffix.setdefault(trans_num, set()).add(avr_id or trans_num)
        pan_digits = _tag_digits(avr.get("pan"))
        if pan_digits:
            by_suffix.setdefault(pan_digits, set()).add(avr_id or pan_digits)
    return by_suffix


def match_avr_sync(
    row: dict[str, Any], avr_index: dict[str, set[str]], avr_rows: list[dict[str, Any]]
) -> bool:
    txn_id = str(row.get("transaction_id") or "")
    if not txn_id:
        return False

    for part in txn_id.replace("-CONSEC", "").split("-"):
        if part.isdigit() and part in avr_index:
            return True

    tag_digits = _tag_digits(row.get("asset_tag"))
    if tag_digits and tag_digits in avr_index:
        return True

    asset = str(row.get("asset_number") or "").strip()
    dt = row.get("date_time")
    if asset and dt:
        for avr in avr_rows:
            if avr.get("asset_code") == asset and avr.get("date"):
                if avr["date"].date() == dt.date():
                    return True
    return False


def apply_exception_split(
    transactions: list[dict[str, Any]],
    computed: dict[str, ComputedTransaction],
) -> None:
    for row in transactions:
        txn_id = str(row.get("transaction_id") or "")
        comp = computed.get(txn_id)
        if not comp:
            continue
        row["exception_60"] = comp.flags.reason_60()
        row["exception_120"] = comp.flags.reason_120()
        row["_computed"] = comp


def apply_economy_fields(row: dict[str, Any]) -> None:
    row["economy_type"] = _economy_type(row.get("meter_type"))
    economy = _compute_economy(row)
    row["economy"] = economy
    avg = _parse_avg_economy(row.get("avg_economy_180d"))
    if avg is not None:
        row["avg_economy_180d"] = avg
    row["pct_variance"] = _pct_variance(economy, avg)


def suggested_abco_comment(row: dict[str, Any], comp: ComputedTransaction | None) -> str | None:
    if row.get("abco_comment"):
        return row["abco_comment"]
    if row.get("_avr_sync"):
        return "AVR Sync"
    if comp and comp.flags.initial_dispense:
        return "Initial Dispense"
    return None


def should_escalate(
    row: dict[str, Any],
    comp: ComputedTransaction | None,
    economy_threshold: float = DEFAULT_ECONOMY_VARIANCE_THRESHOLD,
) -> bool:
    if not comp:
        return False
    flags = comp.flags
    if flags.initial_dispense:
        return True
    if flags.meter_reset or flags.odo_jump_50:
        return True
    if flags.fill_outside_hour:
        return True
    if flags.over_tank_cumulative:
        return True
    if row.get("_avr_sync"):
        return True
    if flags.reason_60() and not flags.is_routine_split_fill():
        return True

    variance = row.get("pct_variance")
    usage = row.get("total_usage_num")
    if (
        variance is not None
        and usage is not None
        and usage > 0
        and abs(variance) > economy_threshold
        and str(row.get("refund_eligibility") or "").lower() == "eligible"
    ):
        return True
    return False


def suggested_possible_cause(row: dict[str, Any], comp: ComputedTransaction | None) -> str | None:
    if row.get("_avr_sync") or (row.get("abco_comment") or "").lower() == "avr sync":
        return "AVR"
    if comp and comp.flags.fill_outside_hour:
        return "Dispensing Point Error?"
    if comp and (
        comp.flags.odo_non_positive
        or comp.flags.odo_jump_50
        or comp.flags.meter_reset
        or comp.flags.consec_60
    ):
        return "AVR?"
    return None


def enrich_transactions(
    transactions: list[dict[str, Any]],
    asset_lookup: dict[str, dict[str, Any]],
    avr_rows: list[dict[str, Any]],
    economy_threshold: float = DEFAULT_ECONOMY_VARIANCE_THRESHOLD,
) -> dict[str, Any]:
    mining_rows = [t for t in transactions if is_mining_eligible(t)]
    computed = compute_all(mining_rows)
    avr_index = build_avr_match_index(avr_rows)

    review_queue: list[dict[str, Any]] = []
    flagged_count = 0
    avr_sync_count = 0

    for row in mining_rows:
        apply_asset_lookup(row, asset_lookup)
        apply_exception_split([row], computed)
        comp = computed.get(str(row.get("transaction_id") or ""))
        apply_economy_fields(row)

        if match_avr_sync(row, avr_index, avr_rows):
            row["_avr_sync"] = True
            avr_sync_count += 1

        comment = suggested_abco_comment(row, comp)
        if comment:
            row["abco_comment"] = comment

        if comp and (comp.flags.reason_60() or comp.flags.reason_120()):
            flagged_count += 1

        if should_escalate(row, comp, economy_threshold):
            row["_review"] = True
            review_queue.append(dict(row))

    return {
        "transactions": mining_rows,
        "computed": computed,
        "review_queue": review_queue,
        "flagged_count": flagged_count,
        "avr_sync_count": avr_sync_count,
        "excluded_non_mining": len(transactions) - len(mining_rows),
    }


def build_possible_cause_summary(
    review_queue: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    buckets: dict[str, dict[str, Any]] = {}
    for row in review_queue:
        comp = row.get("_computed")
        exc = None
        if comp:
            exc = comp.flags.reason_60() or comp.flags.reason_120()
        exc = exc or row.get("exception_60") or row.get("exception_120") or "Unclassified"
        cause = suggested_possible_cause(row, comp) or "Review"
        key = f"{exc}||{cause}"
        bucket = buckets.setdefault(
            key,
            {
                "exception_reason": exc,
                "possible_cause": cause,
                "transaction_count": 0,
                "litres": 0.0,
            },
        )
        bucket["transaction_count"] += 1
        bucket["litres"] += float(row.get("litres") or 0)

    rows = list(buckets.values())
    rows.sort(key=lambda r: (-r["transaction_count"], -r["litres"]))
    return rows


def build_summary_per_asset(review_queue: list[dict[str, Any]]) -> list[dict[str, Any]]:
    buckets: dict[str, dict[str, Any]] = {}
    for row in review_queue:
        asset = str(row.get("asset_number") or "UNKNOWN")
        bucket = buckets.setdefault(
            asset,
            {
                "asset_number": asset,
                "asset_description": row.get("asset_description"),
                "department": row.get("department"),
                "transaction_count": 0,
                "litres": 0.0,
            },
        )
        bucket["transaction_count"] += 1
        bucket["litres"] += float(row.get("litres") or 0)

    rows = list(buckets.values())
    rows.sort(key=lambda r: (-r["litres"], -r["transaction_count"]))
    return rows
