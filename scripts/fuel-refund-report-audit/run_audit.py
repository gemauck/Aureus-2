#!/usr/bin/env python3
"""CLI entry point for Fuel Refund Report Audit."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from parse_workbook import parse_workbook
from report_writer import build_summary_json, write_audit_workbook
from rules import run_all_rules


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Audit Detailed Fuel Refund Report workbooks")
    parser.add_argument("--input", "-i", required=True, help="Input .xlsx path")
    parser.add_argument(
        "--output",
        "-o",
        help="Output audit workbook (default: <input>-audit.xlsx)",
    )
    parser.add_argument("--json", "-j", help="Write JSON summary to this path")
    parser.add_argument(
        "--report-stage",
        choices=("checking", "final"),
        default="checking",
        help="checking: standard review; final: flag tank litres still on asset tabs",
    )
    parser.add_argument(
        "--require-pump-readings",
        action="store_true",
        help="Require pump readings on dispense-type rows",
    )
    parser.add_argument(
        "--require-tank-readings",
        action="store_true",
        help="Require tank litre readings on combined and asset sheets",
    )
    parser.add_argument(
        "--require-consumption-assessment",
        action="store_true",
        help="Flag unrealistic consumption (L/hr or L/km) vs asset median and caps",
    )
    parser.add_argument(
        "--enable-v2",
        action="store_true",
        help="Enable v2 heuristic checks",
    )
    parser.add_argument(
        "--fail-on-warnings",
        action="store_true",
        help="Exit 1 when warnings exist (default: only errors)",
    )
    args = parser.parse_args(argv)

    input_path = Path(args.input).expanduser().resolve()
    if not input_path.exists():
        print(f"Input not found: {input_path}", file=sys.stderr)
        return 2

    output_path = (
        Path(args.output).expanduser().resolve()
        if args.output
        else input_path.with_name(f"{input_path.stem}-audit{input_path.suffix}")
    )

    print(f"Parsing {input_path}...")
    parsed = parse_workbook(input_path)
    print(
        f"  Combined rows: {len(parsed.combined_rows)} | "
        f"Receipts: {len(parsed.fuel_receipts)} | "
        f"Asset sheets: {len(parsed.asset_sheets)}"
    )

    findings, checks_skipped = run_all_rules(
        parsed,
        report_stage=args.report_stage,
        enable_v2=args.enable_v2,
        require_pump_readings=args.require_pump_readings,
        require_tank_readings=args.require_tank_readings,
        require_consumption_assessment=args.require_consumption_assessment,
    )
    summary = build_summary_json(findings, parsed, checks_skipped=checks_skipped)

    print(f"Writing audit workbook → {output_path}")
    write_audit_workbook(input_path, output_path, findings, parsed)

    if args.json:
        json_path = Path(args.json).expanduser().resolve()
        json_path.parent.mkdir(parents=True, exist_ok=True)
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2, default=str)
        print(f"JSON summary → {json_path}")

    by_sev = summary.get("by_severity", {})
    print(
        f"Done: {summary['finding_count']} findings "
        f"(errors={by_sev.get('error', 0)}, warnings={by_sev.get('warning', 0)}, info={by_sev.get('info', 0)})"
    )

    if summary.get("has_errors"):
        return 1
    if args.fail_on_warnings and by_sev.get("warning", 0) > 0:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
