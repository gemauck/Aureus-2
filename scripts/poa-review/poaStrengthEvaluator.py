"""
Rules-based POA batch strength evaluation (per label / dispense group).
"""
from __future__ import annotations

import json
import os
import re
from difflib import SequenceMatcher
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

HOLISTIC_ACTIVITY_COLUMNS = (
    "Activity",
    "Operation Description / Comment",
    "Comments",
    "Asset Description",
    "Custom Attribute",
)

PROOF_ROW_SKIP_COLUMNS = frozenset({
    "transaction id",
    "transactionid",
    "asset number",
    "date & time",
    "datetime",
    "label",
    "is consec",
    "no poa asset",
    "count of proof before transaction",
    "time since last activity",
    "total smr",
    "poa strength",
    "poa compliance points",
    "poa shortfalls",
    "opening smr",
    "closing smr",
    "total smr usage",
    "total usage km/hr",
    "loads / tonnes",
    "litres",
    "total fuel used (l)",
    "eligible volume (l) (claimable % of total)",
    "eligible price",
    "eligible total (r)",
    "pump before",
    "pump after",
    "opening odo",
    "closing odo",
})


def _norm_col(name: Any) -> str:
    if name is None:
        return ""
    return str(name).strip().lower()


def _norm(s: Any) -> str:
    if s is None or (isinstance(s, float) and pd.isna(s)):
        return ""
    return str(s).strip().lower()


MATCH_CFG_DEFAULT = {
    "fuzzyMinRatio": 0.86,
    "minTokenOverlap": 2,
    "minTokenLength": 3,
}


def _matching_cfg(rules: dict | None) -> dict:
    if not rules:
        return dict(MATCH_CFG_DEFAULT)
    base = dict(MATCH_CFG_DEFAULT)
    base.update(rules.get("activityMatching") or {})
    return base


def _normalize_for_match(value: str) -> str:
    s = str(value).lower().strip()
    s = s.replace("&", " and ")
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _match_tokens(value: str, min_len: int = 2) -> list[str]:
    return [t for t in _normalize_for_match(value).split() if len(t) >= min_len]


def _token_equivalent(token: str, token_set: set[str]) -> bool:
    if token in token_set:
        return True
    if len(token) > 4 and token.endswith("s") and token[:-1] in token_set:
        return True
    if (token + "s") in token_set:
        return True
    if len(token) > 5 and token.endswith("ing"):
        stem = token[:-3]
        if stem in token_set or (stem + "e") in token_set:
            return True
    return False


def _token_overlap_match(term: str, text: str, min_overlap: int) -> bool:
    term_tokens = [t for t in _match_tokens(term, 3) if len(t) >= 3]
    if not term_tokens:
        return _normalize_for_match(term) in _normalize_for_match(text)
    text_tokens = set(_match_tokens(text, 2))
    hits = sum(1 for t in term_tokens if _token_equivalent(t, text_tokens))
    return hits >= min(len(term_tokens), max(1, min_overlap))


def _fuzzy_phrase_match(term: str, text: str, min_ratio: float) -> bool:
    norm_term = _normalize_for_match(term)
    if len(norm_term) < 8:
        return False
    norm_text = _normalize_for_match(text)
    for segment in re.split(r"\s*\|\s*", norm_text):
        segment = segment.strip()
        if not segment:
            continue
        if SequenceMatcher(None, norm_term, segment).ratio() >= min_ratio:
            return True
        seg_tokens = _match_tokens(segment, 3)
        term_token_count = len(_match_tokens(norm_term, 3))
        if term_token_count < 2:
            continue
        for idx in range(len(seg_tokens) - term_token_count + 1):
            chunk = " ".join(seg_tokens[idx : idx + term_token_count])
            if SequenceMatcher(None, norm_term, chunk).ratio() >= min_ratio:
                return True
    return False


def _variants_for_term(term: str) -> list[str]:
    base = _normalize_for_match(term)
    if not base:
        return []
    variants = {base, term.lower().strip()}
    if "&" in term.lower():
        variants.add(_normalize_for_match(term.replace("&", " and ")))
    if " and " in base:
        variants.add(base.replace(" and ", " & "))
    parts = base.split()
    if parts:
        last = parts[-1]
        if last.endswith("s") and len(last) > 3:
            variants.add(" ".join(parts[:-1] + [last[:-1]]))
        else:
            variants.add(" ".join(parts + [last + "s"]))
    return [v for v in variants if v]


def _expand_activity_terms(terms: list[str], alias_groups: list | None) -> list[str]:
    """Keep original Schedule 6 + spreadsheet terms and add spelling/punctuation variants."""
    seen: set[str] = set()
    expanded: list[str] = []
    for term in terms:
        for variant in _variants_for_term(term):
            if variant not in seen:
                seen.add(variant)
                expanded.append(variant)
        if term.lower().strip() not in seen:
            seen.add(term.lower().strip())
            expanded.append(term.lower().strip())
    for group in alias_groups or []:
        if not isinstance(group, list):
            continue
        for entry in group:
            norm = _normalize_for_match(entry)
            if norm and norm not in seen:
                seen.add(norm)
                expanded.append(norm)
    return expanded


def _flex_contains_term(text: str, term: str, match_cfg: dict) -> bool:
    if not text or not term:
        return False
    t = term.lower().strip()
    lowered = text.lower()
    if re.search(r"[\s\-&/]", t):
        if t in lowered:
            return True
    elif re.search(rf"(?<![a-z0-9]){re.escape(t)}(?![a-z0-9])", lowered):
        return True
    norm_term = _normalize_for_match(term)
    norm_text = _normalize_for_match(text)
    if norm_term and norm_term in norm_text:
        return True
    min_overlap = int(match_cfg.get("minTokenOverlap", 2))
    if _token_overlap_match(term, text, min_overlap):
        return True
    fuzzy_ratio = float(match_cfg.get("fuzzyMinRatio", 0.86))
    return _fuzzy_phrase_match(term, text, fuzzy_ratio)


def _prepare_rules_matching(rules: dict) -> None:
    """Expand activity term lists once: initial rules + spreadsheet + alias groups."""
    alias_root = rules.get("activityAliasGroups") or {}
    for sector, cfg in (rules.get("sectors") or {}).items():
        if not isinstance(cfg, dict):
            continue
        groups = alias_root.get(sector, []) if isinstance(alias_root, dict) else []
        for field in ("primaryActivities", "secondaryActivities", "excludedActivities"):
            raw = cfg.get(field) or []
            cfg[field] = _expand_activity_terms(raw, groups)


def _contains_any(
    text: str,
    terms: list[str],
    match_cfg: dict | None = None,
) -> str | None:
    if not text:
        return None
    cfg = match_cfg or MATCH_CFG_DEFAULT
    for term in terms:
        if not term:
            continue
        if _flex_contains_term(text, term, cfg):
            return term
    return None


def _is_mostly_numeric(value: str) -> bool:
    compact = value.replace(".", "").replace(",", "").replace("-", "").strip()
    return bool(compact) and compact.isdigit()


def _collect_row_field_snippets(row: pd.Series) -> list[str]:
    """Non-standard columns on a proof row (holistic context beyond Activity)."""
    structured = {_norm_col(c) for c in HOLISTIC_ACTIVITY_COLUMNS}
    structured.update({"material", "location", "location.1", "source"})
    snippets: list[str] = []
    for col in row.index:
        cn = _norm_col(col)
        if not cn or cn in PROOF_ROW_SKIP_COLUMNS or cn in structured:
            continue
        v = _norm(row.get(col))
        if not v or len(v) > 120 or _is_mostly_numeric(v):
            continue
        snippets.append(v)
    return snippets


def _build_holistic_activity_text(batch: dict) -> str:
    parts: list[str] = []
    for key in ("activities", "comments", "fieldSnippets", "materials", "locations", "sources"):
        parts.extend(batch.get(key) or [])
    return " | ".join(dict.fromkeys(p for p in parts if p))


def _activity_label_text(batch: dict) -> str:
    return " | ".join(batch.get("activities", []) + batch.get("comments", []))


def _haulage_activity_patterns(sector_rules: dict) -> list[str]:
    cfg = sector_rules.get("activityInference") or {}
    haul = cfg.get("haulageWithPrimaryMaterialAndLocation") or {}
    patterns = haul.get("activityPatterns")
    if patterns:
        return list(patterns)
    return [
        "transport",
        "haul",
        "hauling",
        "laden",
        "travel distance",
        "dump truck",
        "carting",
        "moving material",
        "transporting material",
        "transporting materials",
        "loading",
        "loaded",
    ]


def _infer_primary_haulage_activity(
    batch: dict,
    sector: str,
    sector_rules: dict,
    holistic_text: str,
    match_cfg: dict | None = None,
) -> str | None:
    """Transport + primary material + site location → eligible production haul (esp. mining)."""
    if sector != "mining":
        return None

    cfg = match_cfg or MATCH_CFG_DEFAULT
    mat_text = " | ".join(batch.get("materials", []))
    loc_text = " | ".join(batch.get("locations", []))
    label_text = _activity_label_text(batch) or holistic_text

    pri_mat = _contains_any(
        mat_text or holistic_text,
        sector_rules.get("primaryMaterials", []),
        match_cfg,
    )
    pri_loc = _contains_any(
        loc_text or holistic_text,
        sector_rules.get("primaryLocations", []),
        match_cfg,
    )
    if not pri_mat or not pri_loc:
        return None

    if not _contains_any(label_text, _haulage_activity_patterns(sector_rules), match_cfg):
        return None

    return "in-pit transport / haul (inferred from material, location, and haul activity)"


def evaluate_activity_criterion(
    batch: dict,
    sector: str,
    sector_rules: dict,
    sector_label: str,
    holistic_text: str,
    match_cfg: dict | None = None,
) -> dict:
    """Assess activity using full proof row context, not the Activity column alone."""
    activity_label = _activity_label_text(batch)
    holistic = holistic_text or _build_holistic_activity_text(batch)
    cfg = match_cfg or MATCH_CFG_DEFAULT

    excluded = _contains_any(
        activity_label or holistic,
        sector_rules.get("excludedActivities", []),
        cfg,
    )
    sec_act = _contains_any(activity_label, sector_rules.get("secondaryActivities", []), cfg)
    pri_act = _contains_any(holistic, sector_rules.get("primaryActivities", []), cfg)
    inference = None

    if not pri_act and not excluded:
        inference = _infer_primary_haulage_activity(batch, sector, sector_rules, holistic, cfg)
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
        rules = json.load(f)
    _prepare_rules_matching(rules)
    return rules


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
            "fieldSnippets": [],
            "intensityValues": {},
            "combinedText": "",
            "holisticText": "",
        }

    activities, locations, materials, sources, comments, field_snippets = [], [], [], [], [], []
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
        field_snippets.extend(_collect_row_field_snippets(row))

    for col in proof_df.columns:
        if col in ("Loads / Tonnes", "Total SMR Usage", "Total Usage Km/Hr", "Opening SMR", "Closing SMR"):
            try:
                nums = pd.to_numeric(proof_df[col], errors="coerce").fillna(0)
                total = float(nums.sum())
                if total > 0:
                    intensity_values[col] = total
            except Exception:
                pass

    combined_parts = (
        activities + comments + field_snippets + locations + materials + sources
    )
    combined_text = " | ".join(dict.fromkeys(combined_parts))
    holistic_text = " | ".join(
        dict.fromkeys(activities + comments + field_snippets + materials + locations)
    )

    return {
        "proofCount": len(proof_df),
        "activities": list(dict.fromkeys(activities)),
        "locations": list(dict.fromkeys(locations)),
        "materials": list(dict.fromkeys(materials)),
        "sources": list(dict.fromkeys(sources)),
        "comments": list(dict.fromkeys(comments)),
        "fieldSnippets": list(dict.fromkeys(field_snippets)),
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
    match_cfg = _matching_cfg(rules)

    text = batch.get("combinedText", "")
    holistic_text = batch.get("holisticText") or _build_holistic_activity_text(batch) or text

    activity_eval = evaluate_activity_criterion(
        batch,
        sector,
        sector_rules,
        sector_label,
        holistic_text,
        match_cfg,
    )
    activity_ok = bool(activity_eval.get("ok"))
    pri_act = activity_eval.get("matchedTerm")
    if activity_eval.get("shortfall"):
        shortfalls.append(activity_eval["shortfall"])

    loc_text = " | ".join(batch.get("locations", []))
    sec_loc = _contains_any(loc_text or text, sector_rules.get("secondaryLocations", []), match_cfg)
    pri_loc = _contains_any(loc_text or text, sector_rules.get("primaryLocations", []), match_cfg)

    if not loc_text.strip() and not _contains_any(
        text, sector_rules.get("primaryLocations", []), match_cfg
    ):
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
    sec_mat = _contains_any(mat_text or text, sector_rules.get("secondaryMaterials", []), match_cfg)
    pri_mat = _contains_any(mat_text or text, sector_rules.get("primaryMaterials", []), match_cfg)

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
        if _contains_any(text, kw, match_cfg):
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
