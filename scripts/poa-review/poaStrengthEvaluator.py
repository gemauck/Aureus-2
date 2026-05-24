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

POA_COMPLIANCE_POINTS_COL = "POA Compliance Points"
COMPLIANCE_POINTS_FILL = "D9EAD3"
SHORTFALLS_COLUMN_FILL = "F4CCCC"

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
    "Asset Description",
    "Custom Attribute",
]

# Columns used to read activity holistically (not location/material alone for the activity criterion).
HOLISTIC_ACTIVITY_COLUMNS = (
    "Activity",
    "Operation Description / Comment",
    "Comments",
    "Asset Description",
    "Custom Attribute",
)

HOLISTIC_CONTEXT_COLUMNS = (
    "Material",
    "Location.1",
    "Location",
)


def _norm(s: Any) -> str:
    if s is None or (isinstance(s, float) and pd.isna(s)):
        return ""
    return str(s).strip().lower()


def _contains_any(text: str, terms: list[str]) -> str | None:
    if not text:
        return None
    lowered = text.lower()
    for term in terms:
        t = term.lower().strip()
        if not t:
            continue
        if re.search(r"[\s\-&/]", t):
            if t in lowered:
                return term
        elif re.search(rf"(?<![a-z0-9]){re.escape(t)}(?![a-z0-9])", lowered):
            return term
    return None


def _build_holistic_activity_text(batch: dict) -> str:
    """All descriptive proof fields — activity is judged in full row context."""
    parts: list[str] = []
    for key in ("activities", "comments", "materials", "locations", "sources"):
        parts.extend(batch.get(key) or [])
    return " | ".join(dict.fromkeys(p for p in parts if p))


def _activity_label_text(batch: dict) -> str:
    """Wording from activity / operation fields only (for secondary & excluded checks)."""
    return " | ".join(batch.get("activities", []) + batch.get("comments", []))


def _haulage_activity_patterns(sector_rules: dict) -> list[str]:
    cfg = sector_rules.get("activityInference") or {}
    haul = cfg.get("haulageWithPrimaryMaterialAndLocation") or {}
    patterns = haul.get("activityPatterns")
    if patterns:
        return list(patterns)
    return [
        "transport", "haul", "hauling", "laden", "travel distance", "dump truck",
        "carting", "moving material", "transporting material", "loading", "loaded",
    ]


def _infer_primary_haulage_activity(
    batch: dict,
    sector: str,
    sector_rules: dict,
    holistic_text: str,
) -> str | None:
    """
    When Activity says e.g. 'Transporting Materials' but Material=Coal and Location=Pit,
    treat as primary in-pit production (Schedule 6 mining haulage).
    """
    if sector != "mining":
        return None

    mat_text = " | ".join(batch.get("materials", []))
    loc_text = " | ".join(batch.get("locations", []))
    label_text = _activity_label_text(batch) or holistic_text

    pri_mat = _contains_any(mat_text or holistic_text, sector_rules.get("primaryMaterials", []))
    pri_loc = _contains_any(loc_text or holistic_text, sector_rules.get("primaryLocations", []))
    if not pri_mat or not pri_loc:
        return None

    if not _contains_any(label_text, _haulage_activity_patterns(sector_rules)):
        return None

    return "in-pit transport / haul (inferred from material, location, and haul activity)"


def evaluate_activity_criterion(
    batch: dict,
    sector: str,
    sector_rules: dict,
    sector_label: str,
    holistic_text: str,
) -> dict:
    """Assess activity using full proof context, not the Activity column alone."""
    activity_label = _activity_label_text(batch)
    holistic = holistic_text or _build_holistic_activity_text(batch)

    excluded = _contains_any(
        activity_label or holistic,
        sector_rules.get("excludedActivities", []),
    )
    # Secondary processing terms: check stated activity/comment first to avoid plant-only ops.
    sec_act = _contains_any(activity_label, sector_rules.get("secondaryActivities", []))
    pri_act = _contains_any(holistic, sector_rules.get("primaryActivities", []))
    inference = None

    if not pri_act and not excluded:
        inference = _infer_primary_haulage_activity(batch, sector, sector_rules, holistic)
        if inference:
            pri_act = inference

    if excluded and not pri_act:
        return {
            "ok": False,
            "matchedTerm": None,
            "inference": None,
            "shortfall": f"Non-eligible {sector_label.lower()} activity for Schedule 6 Part 3 ({excluded})",
        }
    if sec_act and not pri_act:
        return {
            "ok": False,
            "matchedTerm": sec_act,
            "inference": None,
            "shortfall": (
                f"Secondary/non-primary {sector_label.lower()} activity ({sec_act}) — "
                "not own primary production per Schedule 6 Part 3"
            ),
        }
    if pri_act:
        display = (batch.get("activities") or [None])[0] or activity_label.split(" | ")[0] or pri_act
        return {
            "ok": True,
            "matchedTerm": pri_act,
            "inference": inference,
            "display": str(display).strip(),
            "shortfall": None,
        }
    if activity_label.strip() or holistic.strip():
        return {
            "ok": False,
            "matchedTerm": None,
            "inference": None,
            "shortfall": f"No primary Schedule 6 Part 3 {sector_label.lower()} production activity identified",
        }
    return {
        "ok": False,
        "matchedTerm": None,
        "inference": None,
        "shortfall": "No activity description in proof records",
    }


def _sector_from_site_overrides(text: str, rules: dict) -> str | None:
    overrides = rules.get("siteOverrides") or {}
    if not text or not overrides:
        return None
    for site_key, cfg in overrides.items():
        if not isinstance(cfg, dict):
            continue
        sector = cfg.get("sector")
        if sector and site_key.lower().strip() in text:
            return str(sector)
    return None


def _score_sector_keywords(text: str, rules: dict) -> dict[str, int]:
    scores: dict[str, int] = {}
    detection = rules.get("sectorDetection") or {}
    for sector, cfg in detection.items():
        if not isinstance(cfg, dict):
            continue
        score = 0
        for kw in cfg.get("keywords") or []:
            if kw and str(kw).lower().strip() in text:
                score += 1
        if score:
            scores[str(sector)] = score
    return scores


def detect_sector(batch: dict, rules: dict) -> dict:
    """Determine mining / forestry / farming context before applying Schedule 6 Part 3 rules."""
    sectors = rules.get("sectors") or {}
    default_sector = rules.get("defaultSector") or "mining"
    if default_sector not in sectors and sectors:
        default_sector = next(iter(sectors.keys()))

    explicit = batch.get("sector")
    if explicit and str(explicit) in sectors:
        cfg = sectors[str(explicit)]
        return {
            "sector": str(explicit),
            "confidence": "explicit",
            "label": cfg.get("label", str(explicit).title()),
            "schedule6Ref": cfg.get("schedule6Ref", ""),
            "locationLabel": cfg.get("locationLabel", "production site"),
            "advisory": None,
        }

    text = batch.get("combinedText", "")
    asset_desc = _norm(batch.get("assetDescription"))
    if asset_desc:
        text = f"{text} | {asset_desc}"

    override_sector = _sector_from_site_overrides(text, rules)
    if override_sector and override_sector in sectors:
        cfg = sectors[override_sector]
        return {
            "sector": override_sector,
            "confidence": "site",
            "label": cfg.get("label", override_sector.title()),
            "schedule6Ref": cfg.get("schedule6Ref", ""),
            "locationLabel": cfg.get("locationLabel", "production site"),
            "advisory": None,
        }

    scores = _score_sector_keywords(text, rules)
    for sector_key, sector_cfg in sectors.items():
        if not isinstance(sector_cfg, dict):
            continue
        for term in (
            (sector_cfg.get("primaryActivities") or [])
            + (sector_cfg.get("primaryLocations") or [])
            + (sector_cfg.get("primaryMaterials") or [])
        ):
            t = str(term).lower().strip()
            if t and t in text:
                scores[sector_key] = scores.get(sector_key, 0) + 1

    if scores:
        best_sector = max(scores, key=lambda k: scores[k])
        if len(scores) > 1:
            sorted_scores = sorted(scores.values(), reverse=True)
            if sorted_scores[0] == sorted_scores[1]:
                cfg = sectors.get(default_sector, {})
                return {
                    "sector": default_sector,
                    "confidence": "ambiguous",
                    "label": cfg.get("label", default_sector.title()),
                    "schedule6Ref": cfg.get("schedule6Ref", ""),
                    "locationLabel": cfg.get("locationLabel", "production site"),
                    "advisory": (
                        f"Sector context unclear (mixed {', '.join(sorted(scores))} signals) "
                        f"— evaluated as {cfg.get('label', default_sector)}; confirm mining/forestry/farming"
                    ),
                }
        cfg = sectors.get(best_sector, {})
        return {
            "sector": best_sector,
            "confidence": "detected",
            "label": cfg.get("label", best_sector.title()),
            "schedule6Ref": cfg.get("schedule6Ref", ""),
            "locationLabel": cfg.get("locationLabel", "production site"),
            "advisory": None,
        }

    cfg = sectors.get(default_sector, {})
    return {
        "sector": default_sector,
        "confidence": "default",
        "label": cfg.get("label", default_sector.title()),
        "schedule6Ref": cfg.get("schedule6Ref", ""),
        "locationLabel": cfg.get("locationLabel", "production site"),
        "advisory": (
            f"No sector context detected — evaluated as {cfg.get('label', default_sector)}; "
            "confirm mining/forestry/farming applicability"
        ),
    }


def get_sector_rules(rules: dict, sector: str) -> dict:
    sectors = rules.get("sectors") or {}
    if sector in sectors:
        return sectors[sector]
    # Legacy flat rules fallback for older JSON copies.
    return {
        "label": sector.title(),
        "schedule6Ref": "",
        "locationLabel": "mine/pit",
        "primaryActivities": rules.get("primaryActivities", []),
        "secondaryActivities": rules.get("secondaryActivities", []),
        "primaryLocations": rules.get("primaryLocations", []),
        "secondaryLocations": rules.get("secondaryLocations", []),
        "primaryMaterials": rules.get("primaryMaterials", []),
        "secondaryMaterials": rules.get("secondaryMaterials", []),
        "excludedActivities": [],
    }


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
            "holisticText": "",
        }

    activities, locations, materials, sources, comments = [], [], [], [], []
    intensity_values: dict[str, float] = {}

    for _, row in proof_df.iterrows():
        for col in HOLISTIC_ACTIVITY_COLUMNS:
            v = _norm(row.get(col))
            if not v:
                continue
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
    holistic_text = " | ".join(
        dict.fromkeys(activities + comments + materials + locations)
    )

    return {
        "proofCount": len(proof_df),
        "activities": list(dict.fromkeys(activities)),
        "locations": list(dict.fromkeys(locations)),
        "materials": list(dict.fromkeys(materials)),
        "sources": list(dict.fromkeys(sources)),
        "comments": list(dict.fromkeys(comments)),
        "intensityValues": intensity_values,
        "combinedText": combined_text,
        "holisticText": holistic_text,
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
            "compliancePoints": [],
            "method": "rules",
            "sector": None,
            "sectorContext": None,
        }

    sector_ctx = detect_sector(batch, rules)
    sector = sector_ctx["sector"]
    sector_rules = get_sector_rules(rules, sector)
    sector_label = sector_ctx.get("label") or sector_rules.get("label", sector.title())
    location_label = sector_ctx.get("locationLabel") or sector_rules.get("locationLabel", "production site")

    text = batch.get("combinedText", "")
    holistic_text = batch.get("holisticText") or _build_holistic_activity_text(batch) or text

    activity_eval = evaluate_activity_criterion(
        batch, sector, sector_rules, sector_label, holistic_text
    )
    activity_ok = bool(activity_eval.get("ok"))
    pri_act = activity_eval.get("matchedTerm")
    if activity_eval.get("shortfall"):
        shortfalls.append(activity_eval["shortfall"])

    loc_text = " | ".join(batch.get("locations", []))
    sec_loc = _contains_any(loc_text or text, sector_rules.get("secondaryLocations", []))
    pri_loc = _contains_any(loc_text or text, sector_rules.get("primaryLocations", []))

    if not loc_text.strip() and not _contains_any(text, sector_rules.get("primaryLocations", [])):
        location_ok = False
        shortfalls.append(f"No {location_label} location on proof records")
    elif sec_loc and not pri_loc:
        location_ok = False
        shortfalls.append(f"Secondary/non-primary {sector_label.lower()} location only ({sec_loc})")
    elif pri_loc:
        location_ok = True
    elif loc_text.strip():
        location_ok = True
    else:
        location_ok = False
        shortfalls.append(f"No primary {sector_label.lower()} location identified")

    mat_text = " | ".join(batch.get("materials", []))
    sec_mat = _contains_any(mat_text or text, sector_rules.get("secondaryMaterials", []))
    pri_mat = _contains_any(mat_text or text, sector_rules.get("primaryMaterials", []))

    if not mat_text.strip():
        material_ok = False
        shortfalls.append("No material type on proof records")
    elif sec_mat and not pri_mat:
        material_ok = False
        shortfalls.append(
            f"Secondary/processed {sector_label.lower()} material only ({sec_mat})"
        )
    elif pri_mat:
        material_ok = True
    elif mat_text.strip():
        material_ok = True
    else:
        material_ok = False
        shortfalls.append(f"No primary {sector_label.lower()} production material identified")

    intensity_vals = batch.get("intensityValues") or {}
    intensity_ok = len(intensity_vals) > 0
    if not intensity_ok:
        kw = rules.get("intensityTextKeywords", [])
        if _contains_any(text, kw):
            intensity_ok = True
    if not intensity_ok:
        shortfalls.append("No usage intensity (loads, SMR, hours, or hauls)")

    if sector_ctx.get("advisory"):
        shortfalls.append(sector_ctx["advisory"])

    criteria = {
        "activity": activity_ok,
        "location": location_ok,
        "material": material_ok,
        "intensity": intensity_ok,
    }
    score = sum(1 for v in criteria.values() if v)
    strength = tier_from_score(score)
    compliance_points = build_compliance_points(
        batch,
        criteria,
        strength,
        sector_context=sector_ctx,
        matched_activity=pri_act,
        activity_eval=activity_eval,
    )

    return {
        "criteria": criteria,
        "score": score,
        "strength": strength,
        "shortfalls": shortfalls,
        "compliancePoints": compliance_points,
        "method": "rules",
        "sector": sector,
        "sectorContext": sector_ctx,
        "activityMatch": activity_eval,
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


def build_compliance_points(
    batch: dict,
    criteria: dict,
    strength: str | None = None,
    shift_applied: bool = False,
    sector_context: dict | None = None,
    matched_activity: str | None = None,
    activity_eval: dict | None = None,
) -> list[str]:
    """Human-readable positives for criteria met and linked proof context."""
    points: list[str] = []
    proof_count = int(batch.get("proofCount") or 0)
    if proof_count <= 0:
        return points

    points.append(f"{proof_count} linked POA record{'s' if proof_count != 1 else ''}")

    sector_ctx = sector_context or {}
    sector_label = sector_ctx.get("label")
    schedule_ref = sector_ctx.get("schedule6Ref")
    location_label = sector_ctx.get("locationLabel") or "production site"
    if sector_label:
        if schedule_ref:
            points.append(f"Sector context: {sector_label} ({schedule_ref})")
        else:
            points.append(f"Sector context: {sector_label}")

    if strength == STRENGTH_STRONG:
        points.append("Strong overall compliance (4/4 criteria met)")
    elif strength == STRENGTH_MODERATE:
        points.append("Moderate compliance (3/4 criteria met)")

    if criteria.get("activity"):
        acts = batch.get("activities") or []
        activity_eval = activity_eval or {}
        detail = activity_eval.get("display") or (acts[0] if acts else None) or matched_activity
        sector_name = (sector_label or "primary production").lower()
        matched_rule = activity_eval.get("matchedTerm") or matched_activity
        if detail and matched_rule and str(matched_rule).startswith("in-pit transport"):
            mats = batch.get("materials") or []
            locs = batch.get("locations") or []
            context = ", ".join(filter(None, [mats[0] if mats else None, locs[0] if locs else None]))
            points.append(
                f"Primary {sector_name} activity identified: {detail}"
                + (f" (in-pit haul — {context})" if context else " (in-pit haul from material & location)")
            )
        elif detail:
            points.append(f"Primary {sector_name} activity identified ({detail})")
        elif matched_rule:
            points.append(f"Primary {sector_name} activity identified (matched: {matched_rule})")
        else:
            points.append(f"Primary Schedule 6 Part 3 {sector_name} activity identified")

    if criteria.get("location"):
        locs = batch.get("locations") or []
        detail = locs[0] if locs else None
        if detail:
            points.append(f"{location_label.title()} location documented ({detail})")
        else:
            points.append(f"{location_label.title()} location documented on proof")

    if criteria.get("material"):
        mats = batch.get("materials") or []
        detail = mats[0] if mats else None
        sector_name = (sector_label or "production").lower()
        if detail:
            points.append(f"{sector_name.title()} material specified ({detail})")
        else:
            points.append(f"{sector_name.title()} material specified on proof")

    if criteria.get("intensity"):
        intensity_vals = batch.get("intensityValues") or {}
        if intensity_vals:
            parts = [f"{col}: {float(val):g}" for col, val in list(intensity_vals.items())[:2]]
            points.append(f"Usage intensity recorded ({', '.join(parts)})")
        else:
            points.append("Usage intensity evidenced (loads, SMR, hours, or haulage)")

    if shift_applied:
        points.append("Shift/day POA fallback applied (single activity on asset/day)")

    return points


def format_compliance_points(points: list[str] | None) -> str:
    if not points:
        return ""
    return "; ".join(points)


def compliance_points_from_result(eval_result: dict) -> str:
    """Format compliance points from an evaluation result dict."""
    if eval_result.get("compliancePoints"):
        return format_compliance_points(list(eval_result["compliancePoints"]))
    batch = eval_result.get("batch") or {}
    return format_compliance_points(
        build_compliance_points(
            batch,
            eval_result.get("criteria") or {},
            eval_result.get("strength"),
            bool(eval_result.get("shiftProofApplied")),
        )
    )


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
            eval_result["compliancePoints"] = build_compliance_points(
                batch,
                eval_result.get("criteria") or {},
                eval_result.get("strength"),
                shift_applied=True,
                sector_context=eval_result.get("sectorContext"),
            )

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

    compliance_points = llm_result.get("compliancePoints")
    if not compliance_points or not isinstance(compliance_points, list):
        compliance_points = build_compliance_points(
            rules_result.get("batch") or {},
            merged_criteria,
            tier_from_score(score),
            bool(rules_result.get("shiftProofApplied")),
            sector_context=rules_result.get("sectorContext"),
        )

    return {
        "criteria": merged_criteria,
        "score": score,
        "strength": tier_from_score(score),
        "shortfalls": shortfalls,
        "compliancePoints": compliance_points,
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
