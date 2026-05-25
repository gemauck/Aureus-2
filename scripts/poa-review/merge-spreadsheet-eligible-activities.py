#!/usr/bin/env python3
"""Merge eligible-activity spreadsheet rows into poa_strength_rules.json (dry-run default).

Preserves the existing Schedule 6 primaryActivities list and appends spreadsheet descriptions;
load_rules() then expands aliases/plurals/fuzzy variants via activityAliasGroups + activityMatching.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import pandas as pd

SCRIPT_DIR = Path(__file__).resolve().parent
RULES_PATH = SCRIPT_DIR / "poa_strength_rules.json"

SECTOR_MAP = {
    "mining on land": "mining",
    "farming": "farming",
    "forestry": "forestry",
}

MAX_TERM_LEN = 80


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", str(s).strip().lower())


def _is_boilerplate(term: str) -> bool:
    if len(term) <= MAX_TERM_LEN:
        return False
    lower = term.lower()
    return "schedule 6" in lower or "as defined by note" in lower or "customs and excise" in lower


def _terms_from_row(description: str, sars: str) -> list[str]:
    terms: list[str] = []
    if description:
        d = _norm(description)
        terms.append(d)
        for part in re.split(r"[/|]", description):
            p = _norm(part)
            if len(p) > 2:
                terms.append(p)
    if sars:
        for m in re.finditer(r"being (?:the )?([^.\[]+)", sars, re.I):
            phrase = _norm(m.group(1))
            if 3 < len(phrase) <= MAX_TERM_LEN:
                terms.append(phrase)
    return terms


def load_spreadsheet(path: Path) -> tuple[dict[str, set[str]], dict[str, list]]:
    df = pd.read_excel(path)
    df.columns = ["industry", "description", "sars_description"]
    terms_by_sector: dict[str, set[str]] = {k: set() for k in SECTOR_MAP.values()}
    catalog: dict[str, list] = {k: [] for k in SECTOR_MAP.values()}

    for _, row in df.iterrows():
        sector = SECTOR_MAP.get(_norm(row["industry"]))
        if not sector:
            continue
        desc = "" if pd.isna(row["description"]) else str(row["description"]).strip()
        sars = "" if pd.isna(row["sars_description"]) else str(row["sars_description"]).strip()
        catalog[sector].append({"description": desc, "sarsSummary": sars[:600] if sars else ""})
        for term in _terms_from_row(desc, sars):
            if _is_boilerplate(term):
                continue
            terms_by_sector[sector].add(term)

    return terms_by_sector, catalog


def merge_rules(rules: dict, terms_by_sector: dict[str, set[str]], catalog: dict) -> dict:
    sectors = rules.setdefault("sectors", {})
    for sector, new_terms in terms_by_sector.items():
        cfg = sectors.setdefault(sector, {})
        existing = list(cfg.get("primaryActivities") or [])
        merged = list(dict.fromkeys(existing + sorted(new_terms)))
        cfg["primaryActivities"] = merged
        cfg["spreadsheetCatalog"] = catalog.get(sector, [])
    rules["spreadsheetImport"] = {
        "source": "Untitled spreadsheet.xlsx",
        "rowCounts": {k: len(v) for k, v in catalog.items()},
        "primaryTermCounts": {k: len(v) for k, v in terms_by_sector.items()},
    }
    if "mining" in sectors:
        sectors["mining"].setdefault(
            "activityInference",
            {
                "haulageWithPrimaryMaterialAndLocation": {
                    "activityPatterns": [
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
                }
            },
        )
    return rules


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "spreadsheet",
        nargs="?",
        default=str(Path.home() / "Downloads" / "Untitled spreadsheet.xlsx"),
    )
    parser.add_argument("--write", action="store_true", help="Write poa_strength_rules.json")
    args = parser.parse_args()

    terms, catalog = load_spreadsheet(Path(args.spreadsheet))
    with open(RULES_PATH, encoding="utf-8") as f:
        rules = json.load(f)
    merged = merge_rules(rules, terms, catalog)

    print("Primary activity terms added (approx):")
    for sector in ("mining", "farming", "forestry"):
        before = len(rules["sectors"][sector].get("primaryActivities") or [])
        after = len(merged["sectors"][sector]["primaryActivities"])
        print(f"  {sector}: {before} -> {after} ({after - before} new)")

    if args.write:
        with open(RULES_PATH, "w", encoding="utf-8") as f:
            json.dump(merged, f, indent=2)
            f.write("\n")
        print(f"Wrote {RULES_PATH}")
    else:
        print("Dry run — pass --write to update poa_strength_rules.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
