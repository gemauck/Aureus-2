#!/usr/bin/env python3
"""CLI: convert Fuel Dispense Report xlsx to Transactions & Fuel Breakdown format."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from convert import convert_workbook


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Convert Fuel Dispense Report to Transactions & Fuel Breakdown workbook"
    )
    parser.add_argument("--input", "-i", required=True, help="Fuel Dispense Report .xlsx")
    parser.add_argument(
        "--output",
        "-o",
        help="Output .xlsx path (default: derive name from dispense date range in --output-dir)",
    )
    parser.add_argument(
        "--output-dir",
        help="Directory for auto-named output (used when --output omitted)",
    )
    parser.add_argument(
        "--template",
        "-t",
        help="Gilbarco template workbook (default: bundled gilbarco-template.xlsx)",
    )
    parser.add_argument(
        "--pump-config",
        help="JSON pump routing overrides (default: scripts/dispense-to-transactions/pump_config.json)",
    )
    parser.add_argument(
        "--format",
        "-f",
        choices=("gilbarco", "winshuttle"),
        default="gilbarco",
        help="Output format: gilbarco (side-by-side) or winshuttle (SAP upload sheet)",
    )
    parser.add_argument("--json", "-j", help="Write conversion summary JSON to this path")

    args = parser.parse_args(argv)
    summary = convert_workbook(
        args.input,
        args.output,
        output_dir=args.output_dir,
        template_path=args.template,
        pump_config_path=args.pump_config,
        output_format=args.format,
    )

    label = (
        "WinShuttle report"
        if summary.get("output_format") == "winshuttle"
        else "side-by-side workbook"
    )
    print(
        f"Converted {summary['dispense_rows']} dispense rows "
        f"({summary.get('unallocated_rows', 0)} without asset) -> {label}"
    )
    print(f"Output: {summary['output']}")
    if summary.get("period_start") and summary.get("period_end"):
        print(f"Period: {summary['period_start']} - {summary['period_end']}")
    if summary["warnings"]:
        print(f"Warnings ({len(summary['warnings'])}):")
        for w in summary["warnings"][:20]:
            print(f"  - {w}")
        if len(summary["warnings"]) > 20:
            print(f"  ... and {len(summary['warnings']) - 20} more")

    if args.json:
        Path(args.json).write_text(json.dumps(summary, indent=2), encoding="utf-8")
        print(f"Summary JSON: {args.json}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
