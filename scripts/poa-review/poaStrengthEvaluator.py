"""
Rules-based POA batch strength evaluation (per label / dispense group).
"""
from __future__ import annotations

import json
import os
import re
from typing import Any

# Columns that may carry activity / operation wording (not location or material).
ACTIVITY_EVIDENCE_COLUMNS = (
    "Activity",
    "Operation Description / Comment",
    "Comments",
    "Asset Description",
    "Custom Attribute",
)

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
]


def _norm(s: Any) -> str:
    if s is None or (isinstance(s, float) and pd.isna(s)):
        return ""
    return str(s).strip().lower()


def _term_in_text(text: str, term: str) -> bool:
    """Match multi-word phrases as substrings; single tokens use word boundaries."""
    t = term.lower().strip()
    if not t or not text:
        return False
    if re.search(r"[\s\-&/]", t):
        return t in text
    return re.search(rf"(?<![a-z0-9]){re.escape(t)}(?![a-z0-9])", text) is not None


def _contains_any(text: str, terms: list[str]) -> str | None:
    if not text:
        return None
    for term in terms:
        t = term.lower().strip()
        if t and _term_in_text(text, t):
            return term
    return None


def _activity_evidence_from_batch(batch: dict) -> str:
    if batch.get("activityEvidenceText"):
        return str(batch["activityEvidenceText"])
    parts: list[str] = []
    for key in ("activities", "activityDescriptions", "comments"):
        parts.extend(batch.get(key) or [])
    return " | ".join(parts)


def _activity_display_from_batch(batch: dict, evidence: str) -> str:
    if batch.get("activityDisplay"):
        return str(batch["activityDisplay"]).strip()
    acts = batch.get("activities") or []
    if acts:
        return str(acts[0]).strip()
    descriptions = batch.get("activityDescriptions") or []
    if descriptions:
        return str(descriptions[0]).strip()
    return evidence.split(" | ")[0].strip() if evidence else ""


def evaluate_activity_criterion(batch: dict, sector_rules: dict) -> dict:
    """Assess activity using operation fields only (not location/material in combined text)."""
    evidence = _activity_evidence_from_batch(batch).lower()
    display = _activity_display_from_batch(batch, evidence)

    if not evidence.strip():
        return {
            "ok": False,
            "reason": "missing",
            "display": "",
            "evidence": "",
            "matchedTerm": None,
        }

    excluded = _contains_any(evidence, sector_rules.get("excludedActivities", []))
    secondary = _contains_any(evidence, sector_rules.get("secondaryActivities", []))
    primary = _contains_any(evidence, sector_rules.get("primaryActivities", []))

    if excluded and not primary:
        return {
            "ok": False,
            "reason": "excluded",
            "display": display or evidence[:120],
            "evidence": evidence,
            "matchedTerm": excluded,
        }
    if secondary and not primary:
        return {
            "ok": False,
            "reason": "secondary",
            "display": display or evidence[:120],
            "evidence": evidence,
            "matchedTerm": secondary,
        }
    if primary:
        return {
            "ok": True,
            "reason": "primary",
            "display": display or evidence[:120],
            "evidence": evidence,
            "matchedTerm": primary,
        }

    return {
        "ok": False,
        "reason": "unrecognised",
        "display": display or evidence[:120],
        "evidence": evidence,
        "matchedTerm": None,
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
        return _sector_context_from_cfg(str(explicit), cfg, confidence="explicit", advisory=None)

    text = batch.get("combinedText", "")
    asset_desc = _norm(batch.get("assetDescription"))
    if asset_desc:
        text = f"{text} | {asset_desc}"

    override_sector = _sector_from_site_overrides(text, rules)
    if override_sector and override_sector in sectors:
        cfg = sectors[override_sector]
        return _sector_context_from_cfg(override_sector, cfg, confidence="site", advisory=None)

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
                return _sector_context_from_cfg(
                    default_sector,
                    cfg,
                    confidence="ambiguous",
                    advisory=(
                        f"Sector context unclear (mixed {', '.join(sorted(scores))} signals) "
                        f"— evaluated as {cfg.get('label', default_sector)}; confirm mining/forestry/farming"
                    ),
                )
        cfg = sectors.get(best_sector, {})
        return _sector_context_from_cfg(best_sector, cfg, confidence="detected", advisory=None)

    cfg = sectors.get(default_sector, {})
    return _sector_context_from_cfg(
        default_sector,
        cfg,
        confidence="default",
        advisory=(
            f"No sector context detected — evaluated as {cfg.get('label', default_sector)}; "
            "confirm mining/forestry/farming applicability"
        ),
    )


def format_schedule6_citation(schedule6: dict | None, *, short: bool = True) -> str:
    """Format Item 670.04 / Note 6 / paragraph reference per Schedule 6 Part 3 structure."""
    if not schedule6 or not isinstance(schedule6, dict):
        return ""
    item = str(schedule6.get("item") or "670.04").strip()
    note = str(schedule6.get("note") or "6").strip()
    para = str(schedule6.get("paragraph") or "").strip().lower()
    heading = str(schedule6.get("heading") or "").strip()
    if not para:
        return ""
    para_disp = f"({para})"
    if short:
        base = f"Sch. 6, Part 3, Item {item}, Note {note}, para {para_disp}"
    else:
        base = f"Schedule No. 6, Part 3, Item {item}, Note {note}, paragraph {para_disp}"
    if heading:
        return f"{base} — {heading}"
    return base


def sector_schedule6_citation(sector_cfg: dict, *, short: bool = True) -> str:
    schedule6 = sector_cfg.get("schedule6")
    if isinstance(schedule6, dict):
        return format_schedule6_citation(schedule6, short=short)
    legacy = sector_cfg.get("schedule6Ref")
    return str(legacy).strip() if legacy else ""


def _sector_context_from_cfg(sector: str, cfg: dict, **extra) -> dict:
    schedule6 = cfg.get("schedule6") if isinstance(cfg.get("schedule6"), dict) else None
    return {
        "sector": sector,
        "label": cfg.get("label", sector.title()),
        "schedule6": schedule6,
        "schedule6Citation": sector_schedule6_citation(cfg, short=True),
        "schedule6CitationLong": sector_schedule6_citation(cfg, short=False),
        "locationLabel": cfg.get("locationLabel", "production site"),
        **extra,
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
            "activityDescriptions": [],
            "activityEvidenceText": "",
            "activityDisplay": "",
            "locations": [],
            "materials": [],
            "sources": [],
            "comments": [],
            "intensityValues": {},
            "combinedText": "",
        }

    activities, activity_descriptions, locations, materials, sources, comments = [], [], [], [], [], []
    intensity_values: dict[str, float] = {}

    for _, row in proof_df.iterrows():
        for col in ACTIVITY_EVIDENCE_COLUMNS:
            v = _norm(row.get(col))
            if not v:
                continue
            activity_descriptions.append(v)
            if col == "Activity":
                activities.append(v)
            elif col in ("Operation Description / Comment", "Comments"):
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

    combined_parts = activities + activity_descriptions + locations + materials + comments + sources
    combined_text = " | ".join(combined_parts)
    activity_evidence_text = " | ".join(dict.fromkeys(activity_descriptions))
    activity_display = activities[0] if activities else (activity_descriptions[0] if activity_descriptions else "")

    return {
        "proofCount": len(proof_df),
        "activities": list(dict.fromkeys(activities)),
        "activityDescriptions": list(dict.fromkeys(activity_descriptions)),
        "activityEvidenceText": activity_evidence_text,
        "activityDisplay": activity_display,
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
    activity_match = evaluate_activity_criterion(batch, sector_rules)
    activity_ok = bool(activity_match.get("ok"))
    cite = sector_ctx.get("schedule6Citation") or "Item 670.04, Note 6"

    if activity_match.get("reason") == "excluded":
        shortfalls.append(
            f"Non-eligible {sector_label.lower()} activity under {cite} ({activity_match.get('matchedTerm')})"
        )
    elif activity_match.get("reason") == "secondary":
        shortfalls.append(
            f"Secondary/non-primary {sector_label.lower()} activity ({activity_match.get('matchedTerm')}) "
            f"— not own primary production under {cite}"
        )
    elif activity_match.get("reason") == "unrecognised":
        detail = activity_match.get("display") or "see POA activity/operation fields"
        shortfalls.append(
            f"No eligible primary {sector_label.lower()} production activity under {cite} (recorded: {detail})"
        )
    elif activity_match.get("reason") == "missing":
        shortfalls.append("No activity or operation description on proof records")

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
        batch, criteria, strength, sector_context=sector_ctx, activity_match=activity_match
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
        "activityMatch": activity_match,
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
    activity_match: dict | None = None,
) -> list[str]:
    """Human-readable positives for criteria met and linked proof context."""
    points: list[str] = []
    proof_count = int(batch.get("proofCount") or 0)
    if proof_count <= 0:
        return points

    points.append(f"{proof_count} linked POA record{'s' if proof_count != 1 else ''}")

    sector_ctx = sector_context or {}
    sector_label = sector_ctx.get("label")
    schedule_ref = (
        sector_ctx.get("schedule6Citation")
        or sector_ctx.get("schedule6CitationLong")
        or sector_ctx.get("schedule6Ref")
    )
    location_label = sector_ctx.get("locationLabel") or "production site"
    if sector_label and schedule_ref:
        points.append(f"Sector: {sector_label} — {schedule_ref}")
    elif sector_label:
        points.append(f"Sector: {sector_label}")

    if strength == STRENGTH_STRONG:
        points.append("Strong overall compliance (4/4 criteria met)")
    elif strength == STRENGTH_MODERATE:
        points.append("Moderate compliance (3/4 criteria met)")

    am = activity_match or {}
    cite = sector_ctx.get("schedule6Citation") or "Item 670.04, Note 6"
    if am.get("ok"):
        detail = am.get("display") or am.get("matchedTerm") or "primary production"
        term = am.get("matchedTerm")
        if term and term.lower() not in str(detail).lower():
            points.append(
                f"Eligible primary production activity identified: {detail} (matched Schedule 6 term: {term})"
            )
        else:
            points.append(f"Eligible primary production activity identified: {detail}")
    elif am.get("reason") == "secondary":
        detail = am.get("display") or am.get("evidence") or "on proof"
        points.append(
            f"Activity on proof is secondary/non-primary ({am.get('matchedTerm')}): {detail}"
        )
    elif am.get("reason") == "unrecognised":
        detail = am.get("display") or am.get("evidence") or "see POA fields"
        points.append(f"Activity on proof not recognised as eligible primary production: {detail}")
    elif am.get("reason") == "excluded":
        detail = am.get("display") or am.get("evidence") or "on proof"
        points.append(f"Activity on proof is excluded for diesel refund: {detail}")
    else:
        points.append("No activity or operation description on linked POA records")

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
            sector_context=eval_result.get("sectorContext"),
            activity_match=eval_result.get("activityMatch"),
        )
    )


DEFAULT_SHIFT_ADVISORY = (
    "No proof directly before this dispense; single shift/day POA entry may cover this period — verify applicability"
)


def _collect_text_activities(df: pd.DataFrame, max_activities: int):
    activities: set[str] = set()
    for col in ACTIVITY_EVIDENCE_COLUMNS:
        if col not in df.columns:
            continue
        for val in df[col].dropna().astype(str).str.strip():
            if not val:
                continue
            activities.add(val.lower())
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
                activity_match=eval_result.get("activityMatch"),
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
            activity_match=rules_result.get("activityMatch"),
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
