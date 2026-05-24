"""
Rules-based POA batch strength evaluation (per label / dispense group).
"""
from __future__ import annotations

import json
import os
import re
from typing import Any

import pandas as pd

STRENGTH_STRONG = "Strong"
STRENGTH_MODERATE = "Moderate"
STRENGTH_WEAK = "Weak"
STRENGTH_INSUFFICIENT = "Insufficient"

STRENGTH_FILL = {
    STRENGTH_STRONG: "D9EAD3",
    STRENGTH_MODERATE: "CFE2F3",
    STRENGTH_WEAK: "FFF2CC",
    STRENGTH_INSUFFICIENT: "F4CCCC",
}

def _resolve_rules_path() -> str:
    """Resolve rules JSON path; Pyodide exec has no __file__."""
    try:
        base = os.path.dirname(os.path.abspath(__file__))
    except NameError:
        base = "/tmp"
    return os.path.join(base, "poa_strength_rules.json")


RULES_PATH = _resolve_rules_path()

TEXT_FIELDS = [
    "Activity",
    "Operation Description / Comment",
    "Comments",
    "Material",
    "Location.1",
    "Location",
    "Source",
]


def _norm(s: Any) -> str:
    if s is None or (isinstance(s, float) and pd.isna(s)):
        return ""
    return str(s).strip().lower()


def _contains_any(text: str, terms: list[str]) -> str | None:
    if not text:
        return None
    for term in terms:
        t = term.lower().strip()
        if t and t in text:
            return term
    return None


def load_rules(rules_path: str | None = None) -> dict:
    path = rules_path or RULES_PATH
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def aggregate_proof_batch(proof_df: pd.DataFrame) -> dict:
    """Combine proof rows for one label into a single evaluation payload."""
    if proof_df is None or len(proof_df) == 0:
        return {
            "proofCount": 0,
            "activities": [],
            "locations": [],
            "materials": [],
            "sources": [],
            "comments": [],
            "intensityValues": {},
            "combinedText": "",
        }

    activities, locations, materials, sources, comments = [], [], [], [], []
    intensity_values: dict[str, float] = {}

    for _, row in proof_df.iterrows():
        for col in ("Activity", "Operation Description / Comment", "Comments"):
            v = _norm(row.get(col))
            if v:
                if col == "Activity":
                    activities.append(v)
                else:
                    comments.append(v)
        for col in ("Location.1", "Location"):
            v = _norm(row.get(col))
            if v:
                locations.append(v)
        m = _norm(row.get("Material"))
        if m:
            materials.append(m)
        s = _norm(row.get("Source"))
        if s:
            sources.append(s)

    for col in proof_df.columns:
        if col in ("Loads / Tonnes", "Total SMR Usage", "Total Usage Km/Hr", "Opening SMR", "Closing SMR"):
            try:
                nums = pd.to_numeric(proof_df[col], errors="coerce").fillna(0)
                total = float(nums.sum())
                if total > 0:
                    intensity_values[col] = total
            except Exception:
                pass

    combined_parts = activities + locations + materials + comments + sources
    combined_text = " | ".join(combined_parts)

    return {
        "proofCount": len(proof_df),
        "activities": list(dict.fromkeys(activities)),
        "locations": list(dict.fromkeys(locations)),
        "materials": list(dict.fromkeys(materials)),
        "sources": list(dict.fromkeys(sources)),
        "comments": list(dict.fromkeys(comments)),
        "intensityValues": intensity_values,
        "combinedText": combined_text,
    }


def evaluate_batch_rules(batch: dict, rules: dict) -> dict:
    """Return criteria booleans, tier, shortfalls, and score count."""
    shortfalls: list[str] = []

    if batch.get("proofCount", 0) == 0:
        return {
            "criteria": {
                "activity": False,
                "location": False,
                "material": False,
                "intensity": False,
            },
            "score": 0,
            "strength": STRENGTH_INSUFFICIENT,
            "shortfalls": ["No proof-of-activity rows for this batch"],
            "method": "rules",
        }

    text = batch.get("combinedText", "")
    activity_text = " | ".join(batch.get("activities", []) + batch.get("comments", []))

    sec_act = _contains_any(activity_text or text, rules.get("secondaryActivities", []))
    pri_act = _contains_any(activity_text or text, rules.get("primaryActivities", []))

    if sec_act and not pri_act:
        activity_ok = False
        shortfalls.append(f"Secondary/non-primary activity detected ({sec_act})")
    elif pri_act:
        activity_ok = True
    elif activity_text or text.strip():
        activity_ok = False
        shortfalls.append("No primary Schedule 6 production activity identified")
    else:
        activity_ok = False
        shortfalls.append("No activity description in proof records")

    loc_text = " | ".join(batch.get("locations", []))
    sec_loc = _contains_any(loc_text or text, rules.get("secondaryLocations", []))
    pri_loc = _contains_any(loc_text or text, rules.get("primaryLocations", []))

    if not loc_text.strip() and not _contains_any(text, rules.get("primaryLocations", [])):
        location_ok = False
        shortfalls.append("No mine/pit location on proof records")
    elif sec_loc and not pri_loc:
        location_ok = False
        shortfalls.append(f"Secondary location only ({sec_loc})")
    elif pri_loc:
        location_ok = True
    elif loc_text.strip():
        location_ok = True
    else:
        location_ok = False
        shortfalls.append("No primary mine location identified")

    mat_text = " | ".join(batch.get("materials", []))
    sec_mat = _contains_any(mat_text or text, rules.get("secondaryMaterials", []))
    pri_mat = _contains_any(mat_text or text, rules.get("primaryMaterials", []))

    if not mat_text.strip():
        material_ok = False
        shortfalls.append("No material type on proof records")
    elif sec_mat and not pri_mat:
        material_ok = False
        shortfalls.append(f"Secondary/processed material only ({sec_mat})")
    elif pri_mat:
        material_ok = True
    elif mat_text.strip():
        material_ok = True
    else:
        material_ok = False
        shortfalls.append("No primary production material identified")

    intensity_vals = batch.get("intensityValues") or {}
    intensity_ok = len(intensity_vals) > 0
    if not intensity_ok:
        kw = rules.get("intensityTextKeywords", [])
        if _contains_any(text, kw):
            intensity_ok = True
    if not intensity_ok:
        shortfalls.append("No usage intensity (loads, SMR, hours, or hauls)")

    criteria = {
        "activity": activity_ok,
        "location": location_ok,
        "material": material_ok,
        "intensity": intensity_ok,
    }
    score = sum(1 for v in criteria.values() if v)
    strength = tier_from_score(score)

    return {
        "criteria": criteria,
        "score": score,
        "strength": strength,
        "shortfalls": shortfalls,
        "method": "rules",
    }


def tier_from_score(score: int) -> str:
    if score >= 4:
        return STRENGTH_STRONG
    if score == 3:
        return STRENGTH_MODERATE
    if score >= 1:
        return STRENGTH_WEAK
    return STRENGTH_INSUFFICIENT


def format_shortfalls(shortfalls: list[str]) -> str:
    if not shortfalls:
        return ""
    return "; ".join(shortfalls)


DEFAULT_SHIFT_ADVISORY = (
    "No proof directly before this dispense; single shift/day POA entry may cover this period — verify applicability"
)


def _collect_text_activities(df: pd.DataFrame, max_activities: int):
    activities: set[str] = set()
    for col in ("Activity", "Operation Description / Comment", "Comments"):
        if col not in df.columns:
            continue
        for val in df[col].dropna().astype(str).str.strip():
            if not val:
                continue
            activities.add(val)
            if len(activities) > max_activities:
                return None
    return activities


def _shift_day_fallback_proofs(
    txn_rows: pd.DataFrame,
    proofs_by_asset: dict[str, pd.DataFrame],
    rules: dict,
) -> tuple[pd.DataFrame, bool]:
    """When a batch has no linked proof, reuse same-asset shift/day proof if only one activity."""
    cfg = rules.get("shiftProofFallback") or {}
    if cfg.get("enabled") is False:
        return pd.DataFrame(), False

    if len(txn_rows) == 0:
        return pd.DataFrame(), False

    txn_row = txn_rows.iloc[0]
    asset = txn_row.get("Asset Number")
    txn_dt = pd.to_datetime(txn_row.get("Date & Time"), errors="coerce")
    if pd.isna(txn_dt) or pd.isna(asset):
        return pd.DataFrame(), False

    window_h = float(cfg.get("windowHours", 24))
    max_activities = int(cfg.get("maxDistinctActivitiesPerDay", 1))

    asset_proofs = proofs_by_asset.get(str(asset))
    if asset_proofs is None or len(asset_proofs) == 0:
        return pd.DataFrame(), False

    proof_dt = pd.to_datetime(asset_proofs["Date & Time"], errors="coerce")
    txn_day = txn_dt.normalize()
    window_start = txn_dt - pd.Timedelta(hours=window_h)
    in_window = asset_proofs[
        (proof_dt.dt.normalize() == txn_day)
        | ((proof_dt <= txn_dt) & (proof_dt >= window_start))
    ]
    if len(in_window) == 0:
        return pd.DataFrame(), False

    activities = _collect_text_activities(in_window, max_activities)
    if activities is None:
        return pd.DataFrame(), False

    return in_window, True


def evaluate_all_labels(
    data: pd.DataFrame,
    proof_mask: pd.Series,
    transaction_mask: pd.Series,
    rules: dict | None = None,
) -> dict[str, dict]:
    """Evaluate every label that appears on transaction or proof rows."""
    rules = rules or load_rules()
    if "label" not in data.columns:
        return {}

    results: dict[str, dict] = {}
    relevant = data.loc[proof_mask | transaction_mask, "label"].dropna()
    if relevant.empty:
        return {}

    labels = relevant.unique()
    proof_groups = {
        str(label): grp
        for label, grp in data.loc[proof_mask].groupby("label", observed=True, sort=False)
    }
    txn_groups = {
        str(label): grp
        for label, grp in data.loc[transaction_mask].groupby("label", observed=True, sort=False)
    }
    proofs_by_asset = {
        str(asset): grp
        for asset, grp in data.loc[proof_mask].groupby("Asset Number", observed=True, sort=False)
    }

    for label in labels:
        label_str = str(label)
        proof_rows = proof_groups.get(label_str)
        if proof_rows is None:
            proof_rows = pd.DataFrame()
        shift_applied = False
        if len(proof_rows) == 0:
            txn_rows = txn_groups.get(label_str, pd.DataFrame())
            proof_rows, shift_applied = _shift_day_fallback_proofs(
                txn_rows, proofs_by_asset, rules
            )

        batch = aggregate_proof_batch(proof_rows)
        batch["label"] = label_str
        batch["shiftProofApplied"] = shift_applied
        if len(proof_rows) > 0:
            first = proof_rows.iloc[0]
            batch["assetNumber"] = str(first.get("Asset Number", ""))
            batch["assetDescription"] = str(first.get("Asset Description", ""))
        else:
            txn_rows = txn_groups.get(label_str)
            if txn_rows is not None and len(txn_rows) > 0:
                first_txn = txn_rows.iloc[0]
                batch["assetNumber"] = str(first_txn.get("Asset Number", ""))
                batch["assetDescription"] = str(first_txn.get("Asset Description", ""))

        eval_result = evaluate_batch_rules(batch, rules)
        if shift_applied:
            advisory = (rules.get("shiftProofFallback") or {}).get("advisoryNote", DEFAULT_SHIFT_ADVISORY)
            shortfalls = list(eval_result.get("shortfalls") or [])
            if advisory not in shortfalls:
                shortfalls.append(advisory)
            eval_result["shortfalls"] = shortfalls
            eval_result["shiftProofApplied"] = True

        eval_result["batch"] = batch
        results[label_str] = eval_result

    return results


def merge_llm_result(rules_result: dict, llm_result: dict | None) -> dict:
    """Prefer LLM criteria when valid; keep rules as fallback."""
    if not llm_result:
        return rules_result

    criteria = llm_result.get("criteria") or {}
    if not isinstance(criteria, dict):
        return rules_result

    merged_criteria = {
        "activity": bool(criteria.get("activity", rules_result["criteria"]["activity"])),
        "location": bool(criteria.get("location", rules_result["criteria"]["location"])),
        "material": bool(criteria.get("material", rules_result["criteria"]["material"])),
        "intensity": bool(criteria.get("intensity", rules_result["criteria"]["intensity"])),
    }
    score = sum(1 for v in merged_criteria.values() if v)
    shortfalls = llm_result.get("shortfalls")
    if not shortfalls or not isinstance(shortfalls, list):
        shortfalls = rules_result.get("shortfalls", [])

    return {
        "criteria": merged_criteria,
        "score": score,
        "strength": tier_from_score(score),
        "shortfalls": shortfalls,
        "method": "llm",
    }


def summarize_strength_results(label_results: dict[str, dict]) -> dict:
    """Aggregate tier counts for in-app summary."""
    tiers = {STRENGTH_STRONG: 0, STRENGTH_MODERATE: 0, STRENGTH_WEAK: 0, STRENGTH_INSUFFICIENT: 0}
    shortfall_counts: dict[str, int] = {}

    for res in label_results.values():
        tier = res.get("strength", STRENGTH_INSUFFICIENT)
        tiers[tier] = tiers.get(tier, 0) + 1
        for sf in res.get("shortfalls") or []:
            shortfall_counts[sf] = shortfall_counts.get(sf, 0) + 1

    top_shortfalls = sorted(shortfall_counts.items(), key=lambda x: -x[1])[:8]
    total = sum(tiers.values()) or 1

    return {
        "tierCounts": tiers,
        "tierPct": {k: round(v / total * 1000) / 10 for k, v in tiers.items()},
        "topShortfalls": [{"text": t, "count": c} for t, c in top_shortfalls],
        "totalBatches": total,
    }
