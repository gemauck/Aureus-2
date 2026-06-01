"""
Rules-based POA batch strength evaluation (per label / dispense group).
"""
from __future__ import annotations

import json
import os
import re
import sys
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
POA_SHIFT_FALLBACK_COL = "Shift POA Fallback"
POA_ELIGIBILITY_SHORTFALLS_COL = "POA Eligibility Shortfalls"
POA_COMPLETENESS_SHORTFALLS_COL = "POA Completeness Shortfalls"
POA_SHORTFALLS_COL = "POA Shortfalls"
COMPLIANCE_POINTS_FILL = "D9EAD3"
SHORTFALLS_COLUMN_FILL = "F4CCCC"
ELIGIBILITY_SHORTFALLS_FILL = "FCE5CD"

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


def _quick_term_hit(lowered: str, norm_text: str | None, term_lower: str, norm_term: str) -> bool:
    if re.search(r"[\s\-&/]", term_lower):
        if term_lower in lowered:
            return True
    elif re.search(rf"(?<![a-z0-9]){re.escape(term_lower)}(?![a-z0-9])", lowered):
        return True
    if norm_term:
        if norm_text is None:
            norm_text = ""  # caller must pass computed norm_text
        if norm_term in norm_text:
            return True
    return False


class TermMatcher:
    """Token-indexed term lookup: substring/token overlap first; fuzzy only when needed."""

    __slots__ = ("cfg", "_entries", "_by_token", "_fuzzy_terms")

    def __init__(self, terms: list[str], match_cfg: dict | None = None):
        self.cfg = dict(match_cfg or MATCH_CFG_DEFAULT)
        self._entries: list[tuple[str, str, str]] = []
        self._by_token: dict[str, list[int]] = {}
        self._fuzzy_terms: list[str] = []
        seen: set[str] = set()

        for term in terms:
            if not term:
                continue
            orig = str(term)
            key = orig.lower().strip()
            if not key or key in seen:
                continue
            seen.add(key)
            norm = _normalize_for_match(orig)
            idx = len(self._entries)
            self._entries.append((orig, key, norm))
            if len(norm) >= 8:
                self._fuzzy_terms.append(orig)
            tokens = _match_tokens(orig, 3)
            if tokens:
                for tok in tokens[:4]:
                    self._by_token.setdefault(tok, []).append(idx)
            else:
                self._by_token.setdefault("", []).append(idx)

    def find(self, text: str) -> str | None:
        if not text or not self._entries:
            return None
        lowered = text.lower()
        norm_text = _normalize_for_match(text)
        text_tokens = set(_match_tokens(text, 2))
        min_overlap = int(self.cfg.get("minTokenOverlap", 2))

        candidate_idx: set[int] = set()
        for tok in text_tokens:
            for idx in self._by_token.get(tok, []):
                candidate_idx.add(idx)
        if not candidate_idx:
            for idx in self._by_token.get("", []):
                candidate_idx.add(idx)
        if not candidate_idx:
            candidate_idx = set(range(len(self._entries)))

        for idx in sorted(candidate_idx):
            orig, term_lower, norm_term = self._entries[idx]
            if _quick_term_hit(lowered, norm_text, term_lower, norm_term):
                return orig
            if _token_overlap_match(orig, text, min_overlap):
                return orig

        fuzzy_ratio = float(self.cfg.get("fuzzyMinRatio", 0.86))
        for orig in self._fuzzy_terms:
            term_tokens = [t for t in _match_tokens(orig, 3) if len(t) >= 3]
            if term_tokens and not any(_token_equivalent(t, text_tokens) for t in term_tokens):
                continue
            if _fuzzy_phrase_match(orig, text, fuzzy_ratio):
                return orig
        return None


_MATCHER_FIELDS = (
    "primaryActivities",
    "secondaryActivities",
    "excludedActivities",
    "primaryLocations",
    "secondaryLocations",
    "primaryMaterials",
    "secondaryMaterials",
)


def _sector_matcher(sector_rules: dict, field: str) -> TermMatcher:
    matchers = sector_rules.get("_matchers") or {}
    matcher = matchers.get(field)
    if matcher is not None:
        return matcher
    return TermMatcher(sector_rules.get(field) or [], MATCH_CFG_DEFAULT)


def _prepare_sector_detection_index(rules: dict) -> None:
    hits: list[tuple[str, str]] = []
    for sector_key, sector_cfg in (rules.get("sectors") or {}).items():
        if not isinstance(sector_cfg, dict):
            continue
        for field in ("primaryActivities", "primaryLocations", "primaryMaterials"):
            for term in sector_cfg.get(field) or []:
                t = str(term).lower().strip()
                if len(t) >= 2:
                    hits.append((t, str(sector_key)))
    rules["_sectorDetectionHits"] = hits


def _prepare_rules_matching(rules: dict) -> None:
    """Expand activity term lists once and build token indexes for fast batch scoring."""
    alias_root = rules.get("activityAliasGroups") or {}
    match_cfg = _matching_cfg(rules)
    for sector, cfg in (rules.get("sectors") or {}).items():
        if not isinstance(cfg, dict):
            continue
        groups = alias_root.get(sector, []) if isinstance(alias_root, dict) else []
        matchers: dict[str, TermMatcher] = {}
        for field in _MATCHER_FIELDS:
            raw = cfg.get(field) or []
            if field in ("primaryActivities", "secondaryActivities"):
                cfg[field] = _expand_activity_terms(raw, groups)
            elif field == "excludedActivities":
                # Do not merge activityAliasGroups into excluded — avoids false blocks (e.g. dump truck).
                cfg[field] = _expand_activity_terms(raw, None)
            matchers[field] = TermMatcher(cfg.get(field) or [], match_cfg)
        cfg["_matchers"] = matchers
        cfg["_haulageMatcher"] = TermMatcher(_haulage_activity_patterns(cfg), match_cfg)
    rules["_intensityMatcher"] = TermMatcher(rules.get("intensityTextKeywords") or [], match_cfg)
    _prepare_sector_detection_index(rules)


def _contains_any(
    text: str,
    terms: list[str] | TermMatcher,
    match_cfg: dict | None = None,
) -> str | None:
    if not text:
        return None
    if isinstance(terms, TermMatcher):
        return terms.find(text)
    if not terms:
        return None
    return TermMatcher(terms, match_cfg or MATCH_CFG_DEFAULT).find(text)


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
    """Activity + operation/comment fields only (not asset description or equipment labels)."""
    return " | ".join(
        dict.fromkeys(
            (batch.get("activities") or [])
            + (batch.get("opComments") or [])
            + (batch.get("commentsOnly") or [])
        )
    )


def _production_activity_text(batch: dict) -> str:
    return _activity_label_text(batch)


_PRODUCTION_OPERATION_WORDS = (
    "haul",
    "transport",
    "load",
    "loading",
    "mining",
    "drill",
    "blast",
    "excavat",
    "pump",
    "grade",
    "strip",
    "recover",
    "extract",
    "cart",
    "travel distance",
    "laden",
    "tunnel",
    "prospect",
    "dewater",
    "refuel",
    "supply water",
    "crush",
    "dust suppression",
    "separat",
    "stack",
    "fell",
    "harvest",
    "plough",
    "bale",
    "irrigation",
    "carting",
    "blasting",
    "drilling",
    "overburden",
    "topsoil",
    "rehab",
    "maint",
    "servicing",
)


_EQUIPMENT_CATEGORY_TERMS = frozenset(
    {
        "dump truck",
        "dumptruck",
        "excavator",
        "loader",
        "front end loader",
        "dozer",
        "grader",
        "tlb",
        "crane",
        "compressor",
        "fel",
        "adt",
        "generator",
        "lighting plant",
        "bell",
        "tractor",
        "cable handler",
    }
)


def _has_production_operation_wording(text: str) -> bool:
    t = (text or "").lower()
    return any(word in t for word in _PRODUCTION_OPERATION_WORDS)


def _is_equipment_category_term(term: str | None) -> bool:
    if not term:
        return False
    return _normalize_for_match(str(term)) in _EQUIPMENT_CATEGORY_TERMS


def _looks_like_asset_identifier(text: str | None) -> bool:
    """Model/asset codes (e.g. KOMATSU-HM400-ADT) are not production activity descriptions."""
    if not text or not str(text).strip():
        return True
    t = str(text).strip().lower()
    if _has_production_operation_wording(t):
        return False
    if re.match(r"^[a-z]{2,12}-[a-z0-9]{2,12}(-[a-z]{2,6})?$", t):
        return True
    if re.search(r"\b(komatsu|volvo|bell|cat|caterpillar)\b", t) and not re.search(
        r"\b(haul|transport|load|mining|drill|pump|grade)\b", t
    ):
        return True
    return False


def _activity_qualifies_as_production(
    batch: dict,
    production_text: str,
    pri_act: str | None,
    inference: str | None,
) -> bool:
    """Asset/equipment name alone is not Schedule 6 primary production activity."""
    if inference:
        return True
    if not pri_act:
        return False
    if _has_production_operation_wording(production_text):
        return True
    prod = _normalize_for_match(production_text)
    if not prod:
        return False
    if _is_equipment_category_term(pri_act):
        term = _normalize_for_match(pri_act)
        tokens = prod.split()
        # e.g. "dump truck" or "adt" only — not a described production operation
        if prod == term or (len(tokens) <= 2 and term in tokens):
            return False
        # e.g. "dozer 2 seam mb" — operational context beyond equipment noun
        if term in prod and len(tokens) >= 3:
            return True
        return False
    return True


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

    pri_mat = _sector_matcher(sector_rules, "primaryMaterials").find(mat_text or holistic_text)
    pri_loc = _sector_matcher(sector_rules, "primaryLocations").find(loc_text or holistic_text)
    if not pri_mat or not pri_loc:
        return None

    haul_matcher = sector_rules.get("_haulageMatcher") or TermMatcher(
        _haulage_activity_patterns(sector_rules), match_cfg
    )
    if not haul_matcher.find(label_text):
        return None

    return "in-pit transport / haul (inferred from material, location, and haul activity)"


def _status_context_text(batch: dict) -> str:
    """Activity fields plus custom attribute / equipment snippets for status detection."""
    parts = [_production_activity_text(batch)]
    parts.extend(batch.get("fieldSnippets") or [])
    parts.extend(batch.get("assetDescriptions") or [])
    return " | ".join(dict.fromkeys(p for p in parts if p))


def _detect_non_operational_status(batch: dict, sector_rules: dict) -> str | None:
    """
    Asset on breakdown, standby, or idle cannot perform eligible production activity.
    Catches logbook rows like 'Breakdown / Maint' and 'Operator: Breakdown'.
    """
    cfg = (sector_rules.get("activityInference") or {}).get("nonOperationalStatus") or {}
    if cfg.get("enabled") is False:
        return None

    combined = _status_context_text(batch).lower()
    if not combined.strip():
        return None

    patterns = cfg.get("patterns") or [
        "breakdown",
        "standby",
        "stand by",
        "idle",
        "operator: breakdown",
        "insufficient proof",
    ]
    ineligible = str(cfg.get("ineligibleLabel") or "breakdown / non-operational status").strip()

    for pattern in patterns:
        p = str(pattern).lower().strip()
        if not p:
            continue
        if " " in p or ":" in p:
            if p in combined:
                return ineligible
        elif re.search(rf"\b{re.escape(p)}\b", combined):
            return ineligible

    if re.search(r"\bbreakdown\b", combined) and re.search(r"\bmaint\b", combined):
        return ineligible
    return None


def _pri_act_blocked_by_breakdown_context(production_text: str, pri_act: str | None) -> bool:
    """Prevent 'maint' in Breakdown/Maint from matching road/asset maintenance primaries."""
    if not pri_act or not production_text:
        return False
    if not re.search(r"\bbreakdown\b", production_text.lower()):
        return False
    norm_act = _normalize_for_match(pri_act)
    if "maint" in norm_act and "breakdown" not in norm_act:
        return True
    return False


def _infer_refuel_activity(
    batch: dict,
    sector_rules: dict,
    holistic_text: str,
    activity_label: str,
) -> tuple[str, str] | None:
    """
    Refuel/bowser activities: diesel → ineligible; water → eligible primary.
    Uses activity text plus materials/comments in holistic context.
    """
    cfg = (sector_rules.get("activityInference") or {}).get("refuelByProduct") or {}
    if cfg.get("enabled") is False:
        return None

    refuel_patterns = [str(p).lower() for p in (cfg.get("refuelPatterns") or []) if p]
    if not refuel_patterns:
        refuel_patterns = ["refuel", "refuelling", "refueling", "bowser"]
    diesel_signals = [str(s).lower() for s in (cfg.get("dieselSignals") or ["diesel"]) if s]
    water_signals = [str(s).lower() for s in (cfg.get("waterSignals") or ["water"]) if s]

    label_lower = (activity_label or "").lower()
    holistic_lower = (holistic_text or "").lower()
    combined = f"{label_lower} | {holistic_lower}"

    if not any(p in combined for p in refuel_patterns):
        return None

    mat_text = " | ".join(batch.get("materials", [])).lower()
    context = f"{holistic_lower} | {mat_text}"
    has_diesel = any(s in context for s in diesel_signals)
    has_water = any(s in context for s in water_signals)

    ineligible = str(cfg.get("ineligibleTerm") or "refuelling diesel").strip()
    eligible = str(cfg.get("eligibleLabel") or "refuelling water for mining operations").strip()

    if "water" in label_lower and "diesel" not in label_lower:
        return ("primary", eligible)
    if "diesel" in label_lower and "water" not in label_lower:
        return ("excluded", ineligible)

    if has_water and not has_diesel:
        return ("primary", eligible)
    if has_diesel and not has_water:
        return ("excluded", ineligible)
    if has_diesel and has_water:
        if "water" in label_lower:
            return ("primary", eligible)
        return ("excluded", ineligible)
    return None


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

    production_text = _production_activity_text(batch)
    status_context = _status_context_text(batch)

    non_op = _detect_non_operational_status(batch, sector_rules)
    excluded = _sector_matcher(sector_rules, "excludedActivities").find(
        production_text or status_context
    )
    if non_op:
        excluded = excluded or non_op

    sec_act = _sector_matcher(sector_rules, "secondaryActivities").find(activity_label)
    pri_act = (
        _sector_matcher(sector_rules, "primaryActivities").find(production_text)
        if production_text.strip() and not non_op
        else None
    )
    inference = None

    if _pri_act_blocked_by_breakdown_context(production_text, pri_act):
        pri_act = None

    refuel_infer = _infer_refuel_activity(batch, sector_rules, holistic, activity_label)
    if refuel_infer:
        kind, detail = refuel_infer
        if kind == "excluded":
            excluded = excluded or detail
            pri_act = None
        elif kind == "primary" and not excluded:
            pri_act = detail
            inference = detail
            sec_act = None

    if not pri_act and not excluded:
        inference = _infer_primary_haulage_activity(batch, sector, sector_rules, holistic, cfg)
        if inference:
            pri_act = inference

    if pri_act and not _activity_qualifies_as_production(
        batch, production_text, pri_act, inference
    ):
        pri_act = None
        inference = None

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
        display = (batch.get("activities") or [None])[0]
        if not display or _looks_like_asset_identifier(display):
            for key in ("opComments", "commentsOnly"):
                for candidate in batch.get(key) or []:
                    if candidate and not _looks_like_asset_identifier(candidate):
                        display = candidate
                        break
                if display and not _looks_like_asset_identifier(display):
                    break
        if not display or _looks_like_asset_identifier(display):
            display = pri_act if not _is_equipment_category_term(pri_act) else None
        display = str(display or pri_act or "").strip()
        return {
            "ok": True,
            "matchedTerm": pri_act,
            "inference": inference,
            "display": display,
            "shortfall": None,
        }
    if activity_label.strip() or holistic.strip():
        asset_only = (
            _looks_like_asset_identifier(production_text)
            or (
                not production_text.strip()
                and any(_looks_like_asset_identifier(a) for a in batch.get("assetDescriptions") or [])
            )
        )
        if asset_only:
            return {
                "ok": False,
                "matchedTerm": None,
                "inference": None,
                "shortfall": (
                    "Asset or equipment type recorded without a Schedule 6 primary production "
                    "activity (operation description required — not just machine name)"
                ),
            }
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
    for t, sector_key in rules.get("_sectorDetectionHits") or []:
        if t in text:
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


def get_rules_meta(rules: dict | None = None) -> dict:
    """Version metadata for UI display (from rulesMeta in JSON)."""
    rules = rules or load_rules()
    meta = rules.get("rulesMeta") if isinstance(rules.get("rulesMeta"), dict) else {}
    return {
        "version": meta.get("version") or meta.get("lastUpdated") or "unknown",
        "lastUpdated": meta.get("lastUpdated") or meta.get("version") or "",
        "description": meta.get("description") or "",
    }


DEFAULT_POA_SETTINGS = {
    "smrUsageMaxPerActivity": 1000,
    "batchWindowHours": 1,
    "shiftProofWindowHours": 24,
}


def normalize_poa_settings(settings: dict | None) -> dict:
    base = dict(DEFAULT_POA_SETTINGS)
    if not settings or not isinstance(settings, dict):
        return base
    for key in base:
        if settings.get(key) is not None:
            try:
                base[key] = float(settings[key]) if "Hours" in key or "Activity" in key else settings[key]
            except (TypeError, ValueError):
                pass
    if settings.get("smrUsageMaxPerActivity") is not None:
        try:
            base["smrUsageMaxPerActivity"] = float(settings["smrUsageMaxPerActivity"])
        except (TypeError, ValueError):
            pass
    return base


def apply_runtime_settings(rules: dict, settings: dict | None) -> dict:
    """Merge org/UI settings into rules for one evaluation run."""
    cfg = normalize_poa_settings(settings)
    if cfg.get("smrUsageMaxPerActivity") is not None:
        rules["smrUsageMaxPerActivity"] = cfg["smrUsageMaxPerActivity"]
    sfb = dict(rules.get("shiftProofFallback") or {})
    if cfg.get("shiftProofWindowHours") is not None:
        sfb["windowHours"] = int(cfg["shiftProofWindowHours"])
    rules["shiftProofFallback"] = sfb
    rules["_batchWindowHours"] = float(cfg.get("batchWindowHours") or 1)
    return rules


def batch_window_hours(rules: dict | None) -> float:
    if not rules:
        return 1.0
    try:
        return float(rules.get("_batchWindowHours") or 1)
    except (TypeError, ValueError):
        return 1.0


INTENSITY_SUM_COLUMNS = ("Loads / Tonnes", "Total SMR Usage", "Total Usage Km/Hr")
OPENING_SMR_COL = "Opening SMR"
CLOSING_SMR_COL = "Closing SMR"
SMR_DELTA_LABEL = "SMR usage (open→close)"

# Quantified usage in narrative fields only (not activity names like "load and haul").
_INTENSITY_QUANTITY_RE = re.compile(
    r"\b\d+(?:\.\d+)?\s*(?:loads?|tonnes?|tons?|hours?|hrs?|km|ha|bales?|litres?|l)\b",
    re.I,
)


def _smr_max_delta_per_activity(rules: dict | None) -> float:
    if not rules:
        return 1000.0
    val = rules.get("smrUsageMaxPerActivity")
    if val is None:
        val = rules.get("smrUsageMaxReasonable")
    try:
        return float(val) if val is not None else 1000.0
    except (TypeError, ValueError):
        return 1000.0


def _col_numeric(proof_df: pd.DataFrame, col: str) -> pd.Series | None:
    if col not in proof_df.columns:
        return None
    return pd.to_numeric(proof_df[col], errors="coerce")


def collect_batch_intensity(
    proof_df: pd.DataFrame,
    rules: dict | None = None,
) -> tuple[dict[str, float], list[str]]:
    """
    Build intensity metrics and SMR compliance notes for one proof batch.

    - Usage columns (loads, total SMR usage, km/hr): sum positive row values only.
    - Opening/closing SMR: per-row delta (closing − opening), summed across rows — never sum
      raw opening and closing columns together.
    - Zero, negative, and very large deltas are recorded in smr_notes for compliance points
      but do not count as positive usage intensity unless a positive delta exists.
    """
    intensity_values: dict[str, float] = {}
    smr_notes: list[str] = []
    max_delta = _smr_max_delta_per_activity(rules)

    for col in INTENSITY_SUM_COLUMNS:
        nums = _col_numeric(proof_df, col)
        if nums is None:
            continue
        has_any = nums.notna().any()
        positive = nums[nums > 0]
        if len(positive) > 0:
            intensity_values[col] = float(positive.sum())
        elif has_any and (nums.fillna(0) == 0).all():
            smr_notes.append(f"{col}: zero usage recorded")

    opening = _col_numeric(proof_df, OPENING_SMR_COL)
    closing = _col_numeric(proof_df, CLOSING_SMR_COL)
    if opening is None and closing is None:
        return intensity_values, smr_notes

    n = len(proof_df)
    if opening is None:
        opening = pd.Series([np.nan] * n, index=proof_df.index)
    if closing is None:
        closing = pd.Series([np.nan] * n, index=proof_df.index)

    total_delta = 0.0
    pair_count = 0
    for o, c in zip(opening.tolist(), closing.tolist()):
        o_ok = o is not None and not (isinstance(o, float) and pd.isna(o))
        c_ok = c is not None and not (isinstance(c, float) and pd.isna(c))
        if not o_ok and not c_ok:
            continue
        if o_ok and not c_ok:
            smr_notes.append(f"Opening SMR {float(o):g} without matching closing reading")
            continue
        if c_ok and not o_ok:
            smr_notes.append(f"Closing SMR {float(c):g} without matching opening reading")
            continue
        pair_count += 1
        o_f, c_f = float(o), float(c)
        delta = c_f - o_f
        if delta == 0:
            smr_notes.append(f"Opening/closing SMR equal ({o_f:g} → {c_f:g}); zero meter usage")
        elif delta < 0:
            smr_notes.append(
                f"Closing SMR below opening ({o_f:g} → {c_f:g}); review rollover or reset"
            )
        elif delta > max_delta:
            smr_notes.append(
                f"Large SMR delta {delta:g} ({o_f:g} → {c_f:g}); verify readings"
            )
        else:
            total_delta += delta

    if pair_count > 1 and total_delta > 0:
        smr_notes.append(
            f"{pair_count} opening/closing SMR sets; combined usage {total_delta:g}"
        )
    if total_delta > 0:
        intensity_values[SMR_DELTA_LABEL] = total_delta

    return intensity_values, smr_notes


def _narrative_has_quantified_intensity(batch: dict) -> bool:
    """True when comments/operation text cite a numeric load, hour, haul, etc."""
    parts = (
        (batch.get("comments") or [])
        + (batch.get("opComments") or [])
        + (batch.get("fieldSnippets") or [])
    )
    for part in parts:
        if part and _INTENSITY_QUANTITY_RE.search(str(part)):
            return True
    return False


def aggregate_proof_batch(proof_df: pd.DataFrame, rules: dict | None = None) -> dict:
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
            "smrNotes": [],
            "combinedText": "",
            "holisticText": "",
        }

    activities, locations, materials, sources = [], [], [], []
    op_comments, comments_only, asset_descriptions, field_snippets = [], [], [], []

    for col in HOLISTIC_ACTIVITY_COLUMNS:
        if col not in proof_df.columns:
            continue
        vals = proof_df[col].dropna().astype(str).str.strip()
        vals = vals[vals != ""]
        if col == "Activity":
            activities.extend(vals.tolist())
        elif col == "Operation Description / Comment":
            op_comments.extend(vals.tolist())
        elif col == "Comments":
            comments_only.extend(vals.tolist())
        elif col == "Asset Description":
            asset_descriptions.extend(vals.tolist())
        elif col == "Custom Attribute":
            asset_descriptions.extend(vals.tolist())

    for col in ("Location.1", "Location"):
        if col in proof_df.columns:
            vals = proof_df[col].dropna().astype(str).str.strip()
            locations.extend(vals[vals != ""].tolist())
    if "Material" in proof_df.columns:
        vals = proof_df["Material"].dropna().astype(str).str.strip()
        materials.extend(vals[vals != ""].tolist())
    if "Source" in proof_df.columns:
        vals = proof_df["Source"].dropna().astype(str).str.strip()
        sources.extend(vals[vals != ""].tolist())

    structured = {_norm_col(c) for c in HOLISTIC_ACTIVITY_COLUMNS}
    structured.update({"material", "location", "location.1", "source"})
    for col in proof_df.columns:
        cn = _norm_col(col)
        if not cn or cn in PROOF_ROW_SKIP_COLUMNS or cn in structured:
            continue
        vals = proof_df[col].dropna().astype(str).str.strip()
        for v in vals[vals != ""]:
            v_norm = _norm(v)
            if v_norm and len(v_norm) <= 120 and not _is_mostly_numeric(v_norm):
                field_snippets.append(v_norm)

    intensity_values, smr_notes = collect_batch_intensity(proof_df, rules)

    narrative_comments = op_comments + comments_only
    combined_parts = (
        activities
        + narrative_comments
        + asset_descriptions
        + field_snippets
        + locations
        + materials
        + sources
    )
    combined_text = " | ".join(dict.fromkeys(combined_parts))
    holistic_text = " | ".join(
        dict.fromkeys(
            activities
            + narrative_comments
            + field_snippets
            + materials
            + locations
        )
    )

    return {
        "proofCount": len(proof_df),
        "activities": list(dict.fromkeys(activities)),
        "locations": list(dict.fromkeys(locations)),
        "materials": list(dict.fromkeys(materials)),
        "sources": list(dict.fromkeys(sources)),
        "opComments": list(dict.fromkeys(op_comments)),
        "commentsOnly": list(dict.fromkeys(comments_only)),
        "comments": list(dict.fromkeys(narrative_comments)),
        "assetDescriptions": list(dict.fromkeys(asset_descriptions)),
        "fieldSnippets": list(dict.fromkeys(field_snippets)),
        "intensityValues": intensity_values,
        "smrNotes": smr_notes,
        "combinedText": combined_text,
        "holisticText": holistic_text,
    }


def evaluate_batch_rules(batch: dict, rules: dict) -> dict:
    """Return criteria booleans, tier, shortfalls, and score count."""
    activity_shortfalls: list[str] = []
    completeness_shortfalls: list[str] = []

    if batch.get("proofCount", 0) == 0:
        msg = "No proof-of-activity rows for this batch"
        return {
            "criteria": {
                "activity": False,
                "location": False,
                "material": False,
                "intensity": False,
            },
            "score": 0,
            "strength": STRENGTH_INSUFFICIENT,
            "shortfalls": [msg],
            "activityShortfalls": [],
            "completenessShortfalls": [msg],
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
        activity_shortfalls.append(activity_eval["shortfall"])

    loc_text = " | ".join(batch.get("locations", []))
    sec_loc = _sector_matcher(sector_rules, "secondaryLocations").find(loc_text or text)
    pri_loc = _sector_matcher(sector_rules, "primaryLocations").find(loc_text or text)

    if not loc_text.strip() and not _sector_matcher(sector_rules, "primaryLocations").find(text):
        location_ok = False
        completeness_shortfalls.append(f"No {location_label} location on proof records")
    elif sec_loc and not pri_loc:
        location_ok = False
        completeness_shortfalls.append(
            f"Secondary/non-primary {sector_label.lower()} location only ({sec_loc})"
        )
    elif pri_loc:
        location_ok = True
    elif loc_text.strip():
        location_ok = True
    else:
        location_ok = False
        completeness_shortfalls.append(
            f"No primary {sector_label.lower()} location identified"
        )

    mat_text = " | ".join(batch.get("materials", []))
    sec_mat = _sector_matcher(sector_rules, "secondaryMaterials").find(mat_text or text)
    pri_mat = _sector_matcher(sector_rules, "primaryMaterials").find(mat_text or text)

    if not mat_text.strip():
        material_ok = False
        completeness_shortfalls.append("No material type on proof records")
    elif sec_mat and not pri_mat:
        material_ok = False
        completeness_shortfalls.append(
            f"Secondary/processed {sector_label.lower()} material only ({sec_mat})"
        )
    elif pri_mat:
        material_ok = True
    elif mat_text.strip():
        material_ok = True
    else:
        material_ok = False
        completeness_shortfalls.append(
            f"No primary {sector_label.lower()} production material identified"
        )

    intensity_vals = batch.get("intensityValues") or {}
    intensity_ok = len(intensity_vals) > 0
    if not intensity_ok and _narrative_has_quantified_intensity(batch):
        intensity_ok = True
    if not intensity_ok:
        completeness_shortfalls.append("No usage intensity (loads, SMR, hours, or hauls)")

    if sector_ctx.get("advisory"):
        completeness_shortfalls.append(sector_ctx["advisory"])

    shortfalls = activity_shortfalls + completeness_shortfalls

    criteria = {
        "activity": activity_ok,
        "location": location_ok,
        "material": material_ok,
        "intensity": intensity_ok,
    }
    score = sum(1 for v in criteria.values() if v)
    strength = tier_from_score(score)
    shift_applied = bool(batch.get("shiftProofApplied"))
    compliance_points = build_compliance_points(
        batch,
        criteria,
        strength,
        shift_applied=shift_applied,
        sector_context=sector_ctx,
        matched_activity=pri_act,
        activity_eval=activity_eval,
    )

    return {
        "criteria": criteria,
        "score": score,
        "strength": strength,
        "shortfalls": shortfalls,
        "activityShortfalls": activity_shortfalls,
        "completenessShortfalls": completeness_shortfalls,
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

    smr_notes = batch.get("smrNotes") or []
    for note in smr_notes[:4]:
        if note and note not in points:
            points.append(note)

    if criteria.get("intensity"):
        intensity_vals = batch.get("intensityValues") or {}
        if intensity_vals:
            parts = [f"{col}: {float(val):g}" for col, val in list(intensity_vals.items())[:2]]
            points.append(f"Usage intensity recorded ({', '.join(parts)})")

    if shift_applied:
        points.insert(
            1,
            "Shift/day POA fallback — not direct proof immediately before dispense; verify coverage",
        )
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


def _build_proofs_by_asset_index(
    proofs_by_asset: dict[str, pd.DataFrame],
) -> dict[str, dict[str, Any]]:
    """Parse proof datetimes once per asset (shift fallback runs per txn-only label)."""
    index: dict[str, dict[str, Any]] = {}
    for asset, grp in proofs_by_asset.items():
        if grp is None or len(grp) == 0:
            continue
        if "Date & Time" not in grp.columns:
            index[str(asset)] = {"df": grp, "proof_dt": pd.Series(dtype="datetime64[ns]")}
            continue
        index[str(asset)] = {
            "df": grp,
            "proof_dt": pd.to_datetime(grp["Date & Time"], errors="coerce"),
        }
    return index


def _shift_day_fallback_proofs(
    txn_rows: pd.DataFrame,
    proofs_by_asset_index: dict[str, dict[str, Any]],
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

    entry = proofs_by_asset_index.get(str(asset))
    if not entry:
        return pd.DataFrame(), False
    asset_proofs = entry["df"]
    proof_dt = entry["proof_dt"]
    if asset_proofs is None or len(asset_proofs) == 0:
        return pd.DataFrame(), False

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
    settings: dict | None = None,
) -> dict[str, dict]:
    """Evaluate every label that appears on transaction or proof rows."""
    base_rules = rules or load_rules()
    rules = apply_runtime_settings(base_rules, settings)
    if "label" not in data.columns:
        return {}

    results: dict[str, dict] = {}
    relevant = data.loc[proof_mask | transaction_mask, "label"].dropna()
    if relevant.empty:
        return {}

    labels = relevant.unique()
    n_labels = len(labels)
    if n_labels > 500:
        print(f"Evaluating POA strength for {n_labels} batches...", file=sys.stderr, flush=True)

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
    proofs_by_asset_index = _build_proofs_by_asset_index(proofs_by_asset)

    for i, label in enumerate(labels):
        if n_labels > 500 and i > 0 and i % 500 == 0:
            print(f"  POA strength progress: {i}/{n_labels}", file=sys.stderr, flush=True)

        label_str = str(label)
        proof_rows = proof_groups.get(label_str)
        if proof_rows is None:
            proof_rows = pd.DataFrame()
        shift_applied = False
        if len(proof_rows) == 0:
            txn_rows = txn_groups.get(label_str, pd.DataFrame())
            proof_rows, shift_applied = _shift_day_fallback_proofs(
                txn_rows, proofs_by_asset_index, rules
            )

        batch = aggregate_proof_batch(proof_rows, rules)
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
            comp = list(eval_result.get("completenessShortfalls") or [])
            if advisory not in comp:
                comp.append(advisory)
            act = list(eval_result.get("activityShortfalls") or [])
            eval_result["completenessShortfalls"] = comp
            eval_result["activityShortfalls"] = act
            eval_result["shortfalls"] = act + comp
            eval_result["shiftProofApplied"] = True
            eval_result["compliancePoints"] = build_compliance_points(
                batch,
                eval_result.get("criteria") or {},
                eval_result.get("strength"),
                shift_applied=True,
                sector_context=eval_result.get("sectorContext"),
                activity_eval=eval_result.get("activityMatch"),
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
