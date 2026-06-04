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
        "--reference",
        "-r",
        required=True,
        help="Reference Transactions & Fuel Breakdown workbook (fleet/pump lookup)",
    )
    parser.add_argument("--output", "-o", required=True, help="Output .xlsx path")
    parser.add_argument(
        "--template",
        "-t",
        help="Workbook template to preserve extra sheets (default: --reference file)",
    )
    parser.add_argument(
        "--pump-config",
        help="JSON pump routing overrides (default: scripts/dispense-to-transactions/pump_config.json)",
    )
    parser.add_argument(
        "--include-override-fills",
        action="store_true",
        help="Include small manual override fills without asset numbers",
    )
    parser.add_argument("--json", "-j", help="Write conversion summary JSON to this path")

    args = parser.parse_args(argv)
    summary = convert_workbook(
        args.input,
        args.reference,
        args.output,
        template_path=args.template,
        pump_config_path=args.pump_config,
        include_override_fills=args.include_override_fills,
    )

    print(
        f"Converted {summary['dispense_rows']} dispense rows -> "
        f"{summary['all_transactions']} all / {summary['transactions_excl_bowsers']} excl bowser "
        f"({summary['bowser_rows']} bowser)"
    )
    print(f"Output: {summary['output']}")
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
