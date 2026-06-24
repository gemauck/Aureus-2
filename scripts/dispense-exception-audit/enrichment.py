"""Enrich dispense exception transactions with lookups, economy, and review flags."""
from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from exception_rules import ComputedTransaction, compute_all
from site_rules import SiteRuleProfile, get_site_profile

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
    if litres is None or usage is None or usage <= 0:
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
        if not row.get("exception_60"):
            row["exception_60"] = comp.flags.reason_60()
        if not row.get("exception_120"):
            row["exception_120"] = comp.flags.reason_120()
        row["_computed"] = comp


def _normalize_exception_text(text: str | None) -> str:
    if not text:
        return ""
    normalized = str(text).strip().lower()
    return normalized.replace("fill outside of 1 hour", "fill outside of one hour")


def _exception_60_parts(text: str | None) -> set[str]:
    normalized = _normalize_exception_text(text)
    if not normalized:
        return set()
    return {part.strip() for part in normalized.split(",") if part.strip()}


def _is_exact_odo_le_zero(parts: set[str]) -> bool:
    return parts == {"odo difference <= 0"}


def _has_odo_gt_50(parts: set[str]) -> bool:
    return any("odo difference > 50" in part for part in parts)


def _has_fill_outside(parts: set[str]) -> bool:
    return any("fill outside" in part for part in parts)


def _is_routine_split_exception(parts: set[str]) -> bool:
    return (
        "odo difference <= 0" in parts
        and any("consecutive dispenses within 60" in part for part in parts)
        and not _has_fill_outside(parts)
    )


def _review_chain_stays_active(parts: set[str]) -> bool:
    return (
        _is_exact_odo_le_zero(parts)
        or _is_routine_split_exception(parts)
    )


def _effective_exception_60_parts(
    row: dict[str, Any], comp: ComputedTransaction | None
) -> set[str]:
    parts = _exception_60_parts(row.get("exception_60"))
    if parts:
        return parts
    if comp:
        return _exception_60_parts(comp.flags.reason_60())
    return set()


def apply_economy_fields(row: dict[str, Any]) -> None:
    row["economy_type"] = _economy_type(row.get("meter_type"))

    has_source_economy = row.get("economy") is not None and row.get("economy") != ""
    has_source_variance = row.get("pct_variance") is not None and row.get("pct_variance") != ""

    if not has_source_economy:
        row["economy"] = _compute_economy(row)

    avg = _parse_avg_economy(row.get("avg_economy_180d"))
    if avg is not None:
        row["avg_economy_180d"] = avg

    if not has_source_variance:
        row["pct_variance"] = _pct_variance(row.get("economy"), avg)


def review_reason(
    row: dict[str, Any],
    comp: ComputedTransaction | None,
    *,
    prev_row: dict[str, Any] | None = None,
    review_chain_active: bool = False,
) -> str | None:
    if row.get("_avr_sync"):
        return "AVR sync match"
    parts = _effective_exception_60_parts(row, comp)
    if not parts:
        return None
    if _has_fill_outside(parts):
        return "Fill outside one hour"
    if _is_exact_odo_le_zero(parts):
        return "Odo difference <= 0"
    if _has_odo_gt_50(parts):
        return "Odo difference > 50 hrs"
    if _is_routine_split_exception(parts):
        prev_parts = _exception_60_parts(
            prev_row.get("exception_60") if prev_row else None
        )
        if _is_exact_odo_le_zero(prev_parts):
            return "Split fill after odo <= 0"
        if review_chain_active:
            return "Split fill chain"
    return "Exception flagged for review"


def suggested_abco_comment(row: dict[str, Any], comp: ComputedTransaction | None) -> str | None:
    if row.get("abco_comment"):
        return None
    if row.get("_avr_sync"):
        return "AVR Sync"
    if comp and comp.flags.initial_dispense:
        return "Initial Dispense"
    parts = _effective_exception_60_parts(row, comp)
    if _has_fill_outside(parts):
        return "Check 120 min"
    if _has_odo_gt_50(parts):
        variance = row.get("pct_variance")
        if variance is not None and float(variance) < -0.6:
            return "Economy too low"
    return None


def should_escalate(
    row: dict[str, Any],
    comp: ComputedTransaction | None,
    *,
    prev_row: dict[str, Any] | None = None,
    review_chain_active: bool = False,
    economy_threshold: float = DEFAULT_ECONOMY_VARIANCE_THRESHOLD,
    profile: SiteRuleProfile | None = None,
) -> bool:
    rules = profile or get_site_profile()

    if rules.escalate_avr_sync and row.get("_avr_sync"):
        return True

    if rules.respect_abco_ok:
        comment = str(row.get("abco_comment") or "").strip().lower()
        if comment in {"just ok", "ok"}:
            return False

    parts = _effective_exception_60_parts(row, comp)
    if not parts:
        if rules.economy_escalation:
            variance = row.get("pct_variance")
            usage = row.get("total_usage_num")
            threshold = rules.economy_variance_threshold or economy_threshold
            if (
                variance is not None
                and usage is not None
                and usage > 0
                and abs(float(variance)) > threshold
                and str(row.get("refund_eligibility") or "").lower() == "eligible"
            ):
                return True
        return False

    if rules.escalate_fill_outside and _has_fill_outside(parts):
        return True
    if rules.escalate_odo_le_zero and _is_exact_odo_le_zero(parts):
        return True
    if rules.escalate_odo_gt_50 and _has_odo_gt_50(parts):
        return True
    if rules.escalate_split_fill_chain and _is_routine_split_exception(parts):
        prev_parts = _exception_60_parts(
            prev_row.get("exception_60") if prev_row else None
        )
        if _is_exact_odo_le_zero(prev_parts):
            return True
        if review_chain_active:
            return True
    return False


def suggested_possible_cause(row: dict[str, Any], comp: ComputedTransaction | None) -> str | None:
    if row.get("_avr_sync") or (row.get("abco_comment") or "").lower() == "avr sync":
        return "AVR"
    parts = _effective_exception_60_parts(row, comp)
    if _has_fill_outside(parts):
        return "Dispensing Point Error?"
    if parts and (
        _is_exact_odo_le_zero(parts)
        or _is_routine_split_exception(parts)
        or _has_odo_gt_50(parts)
        or any("consecutive dispenses within 60" in part for part in parts)
        or (comp and (comp.flags.odo_non_positive or comp.flags.consec_60))
    ):
        return "AVR?"
    return None


def enrich_transactions(
    transactions: list[dict[str, Any]],
    asset_lookup: dict[str, dict[str, Any]],
    avr_rows: list[dict[str, Any]],
    economy_threshold: float = DEFAULT_ECONOMY_VARIANCE_THRESHOLD,
    profile: SiteRuleProfile | None = None,
) -> dict[str, Any]:
    rules = profile or get_site_profile()
    mining_rows = [t for t in transactions if is_mining_eligible(t)]
    excluded_non_mining = [t for t in transactions if not is_mining_eligible(t)]
    computed = compute_all(mining_rows)
    avr_index = build_avr_match_index(avr_rows)

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

        suggestion = suggested_abco_comment(row, comp)
        if suggestion:
            row["suggested_abco_comment"] = suggestion
            if not row.get("abco_comment"):
                row["abco_comment"] = suggestion

        if row.get("exception_60") or row.get("exception_120"):
            flagged_count += 1

    by_asset: dict[str, list[dict[str, Any]]] = {}
    for row in mining_rows:
        asset = str(row.get("asset_number") or "UNKNOWN")
        by_asset.setdefault(asset, []).append(row)

    review_queue: list[dict[str, Any]] = []
    for asset_rows in by_asset.values():
        asset_rows.sort(key=lambda r: r.get("date_time") or datetime.min)
        review_chain_active = False
        for index, row in enumerate(asset_rows):
            prev_row = asset_rows[index - 1] if index > 0 else None
            comp = row.get("_computed")
            if should_escalate(
                row,
                comp,
                prev_row=prev_row,
                review_chain_active=review_chain_active,
                economy_threshold=economy_threshold,
                profile=rules,
            ):
                row["_review"] = True
                row["review_reason"] = review_reason(
                    row,
                    comp,
                    prev_row=prev_row,
                    review_chain_active=review_chain_active,
                )
                review_queue.append(dict(row))
                review_chain_active = _review_chain_stays_active(
                    _effective_exception_60_parts(row, comp)
                )
            else:
                review_chain_active = False

    return {
        "transactions": mining_rows,
        "excluded_non_mining_rows": excluded_non_mining,
        "computed": computed,
        "review_queue": review_queue,
        "flagged_count": flagged_count,
        "avr_sync_count": avr_sync_count,
        "excluded_non_mining": len(excluded_non_mining),
        "rule_profile": rules.key,
        "rule_profile_label": rules.label,
    }


def build_possible_cause_summary(
    review_queue: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    buckets: dict[str, dict[str, Any]] = {}
    for row in review_queue:
        comp = row.get("_computed")
        exc = row.get("exception_60") or row.get("exception_120")
        if not exc and comp:
            exc = comp.flags.reason_60() or comp.flags.reason_120()
        exc = exc or "Unclassified"
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
    rows.sort(key=_possible_cause_sort_key)
    return rows


def _possible_cause_sort_key(row: dict[str, Any]) -> tuple[int, str]:
    exc = str(row.get("exception_reason") or "").lower()
    if "fill outside" in exc:
        rank = 0
    elif "consecutive dispenses within 60" in exc:
        rank = 1
    elif exc.strip() == "odo difference <= 0":
        rank = 2
    elif "odo difference > 50" in exc:
        rank = 3
    else:
        rank = 9
    return (rank, exc)


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
