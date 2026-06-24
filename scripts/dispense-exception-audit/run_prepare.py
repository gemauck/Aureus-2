#!/usr/bin/env python3
"""Prepare dispense exception workbook for analyst review."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from enrichment import (
    build_possible_cause_summary,
    build_summary_per_asset,
    enrich_transactions,
)
from month_diff import compare_month_over_month
from parse_workbook import load_workbook, parse_asset_lookup, parse_avr_sync_lookup
from prepare_workbook import build_summary_json, infer_site_name, write_prepared_workbook
from site_rules import get_site_profile, list_site_profiles


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Prepare InsightWare dispense exception workbook for analyst review"
    )
    parser.add_argument("--input", "-i", required=True, help="Input .xlsx workbook path")
    parser.add_argument(
        "--output",
        "-o",
        help="Output .xlsx path (default: <input>-prepared.xlsx)",
    )
    parser.add_argument("--json", "-j", help="Also write JSON summary to this path")
    parser.add_argument(
        "--asset-lookup",
        help="Optional Asset Info Lookup .xlsx",
    )
    parser.add_argument(
        "--avr-sync-lookup",
        help="Optional AVR Sync Lookup .xlsx",
    )
    parser.add_argument(
        "--prior-prepared",
        help="Optional prior-month prepared workbook for month-over-month diff",
    )
    parser.add_argument(
        "--rule-profile",
        default=None,
        help="Site rule profile key (default from site_rules.json)",
    )
    parser.add_argument(
        "--list-rule-profiles",
        action="store_true",
        help="List available rule profiles and exit",
    )
    parser.add_argument(
        "--economy-threshold",
        type=float,
        default=0.6,
        help="Abs variance threshold when economy escalation is enabled (0.6 = 60%%)",
    )
    parser.add_argument(
        "--site-name",
        help="Site title for summary sheets (default: inferred from filename)",
    )
    args = parser.parse_args(argv)

    if args.list_rule_profiles:
        print(json.dumps(list_site_profiles(), indent=2))
        return 0

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Input not found: {input_path}", file=sys.stderr)
        return 2

    parsed = load_workbook(str(input_path))
    if not parsed["detection"]["valid"]:
        missing = ", ".join(parsed["detection"]["missing_sheets"])
        print(f"Invalid workbook: missing {missing}", file=sys.stderr)
        return 2

    asset_lookup = parse_asset_lookup(args.asset_lookup)
    avr_rows = parse_avr_sync_lookup(args.avr_sync_lookup)
    profile = get_site_profile(args.rule_profile)

    enriched = enrich_transactions(
        parsed["transactions"],
        asset_lookup,
        avr_rows,
        economy_threshold=args.economy_threshold,
        profile=profile,
    )

    transactions = enriched["transactions"]
    review_queue = enriched["review_queue"]
    possible_causes = build_possible_cause_summary(review_queue)
    summary_per_asset = build_summary_per_asset(review_queue)
    site_name = args.site_name or infer_site_name(str(input_path))
    month_over_month = compare_month_over_month(review_queue, args.prior_prepared)

    output_path = Path(
        args.output or str(input_path).replace(".xlsx", "-prepared.xlsx")
    )
    write_prepared_workbook(
        input_path=str(input_path),
        output_path=str(output_path),
        transactions=transactions,
        review_queue=review_queue,
        possible_causes=possible_causes,
        summary_per_asset=summary_per_asset,
        excluded_non_mining_rows=enriched["excluded_non_mining_rows"],
        asset_lookup_path=args.asset_lookup,
        avr_sync_path=args.avr_sync_lookup,
        site_name=site_name,
    )

    summary = build_summary_json(
        transactions=transactions,
        review_queue=review_queue,
        possible_causes=possible_causes,
        summary_per_asset=summary_per_asset,
        excluded_non_mining=enriched["excluded_non_mining"],
        flagged_count=enriched["flagged_count"],
        avr_sync_count=enriched["avr_sync_count"],
        site_name=site_name,
        rule_profile=enriched.get("rule_profile"),
        rule_profile_label=enriched.get("rule_profile_label"),
        month_over_month=month_over_month,
    )

    if args.json:
        Path(args.json).write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(f"Prepared workbook written to: {output_path}")
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
