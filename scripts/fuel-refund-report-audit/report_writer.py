"""Write audit findings into a copy of the fuel refund workbook."""
from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

import openpyxl
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

from rules import Finding, summarize_findings
from parse_workbook import ParsedWorkbook

HEADER_FILL = PatternFill("solid", fgColor="1F4E79")
HEADER_FONT = Font(bold=True, color="FFFFFF")
SEVERITY_FILLS = {
    "error": PatternFill("solid", fgColor="FFC7CE"),
    "warning": PatternFill("solid", fgColor="FFEB9C"),
    "info": PatternFill("solid", fgColor="DDEBF7"),
}


def write_audit_workbook(
    input_path: str | Path,
    output_path: str | Path,
    findings: list[Finding],
    parsed: ParsedWorkbook,
) -> None:
    input_path = Path(input_path)
    output_path = Path(output_path)
    shutil.copy2(input_path, output_path)

    wb = openpyxl.load_workbook(output_path)
    if "Audit Findings" in wb.sheetnames:
        del wb["Audit Findings"]
    if "Audit Summary" in wb.sheetnames:
        del wb["Audit Summary"]

    ws_findings = wb.create_sheet("Audit Findings", 0)
    finding_headers = [
        "Check ID",
        "Process Task",
        "Severity",
        "Sheet",
        "Excel Row",
        "Transaction ID",
        "Asset Number",
        "Message",
        "Fields (JSON)",
    ]
    for col, title in enumerate(finding_headers, 1):
        cell = ws_findings.cell(row=1, column=col, value=title)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT

    import json

    for ri, finding in enumerate(
        sorted(findings, key=lambda f: (f.severity != "error", f.check_id, f.excel_row or 0)),
        2,
    ):
        ws_findings.cell(row=ri, column=1, value=finding.check_id)
        ws_findings.cell(row=ri, column=2, value=finding.process_task or "")
        sev_cell = ws_findings.cell(row=ri, column=3, value=finding.severity)
        fill = SEVERITY_FILLS.get(finding.severity)
        if fill:
            for c in range(1, len(finding_headers) + 1):
                ws_findings.cell(row=ri, column=c).fill = fill
        ws_findings.cell(row=ri, column=4, value=finding.sheet)
        ws_findings.cell(row=ri, column=5, value=finding.excel_row)
        ws_findings.cell(row=ri, column=6, value=finding.transaction_id)
        ws_findings.cell(row=ri, column=7, value=finding.asset_number)
        ws_findings.cell(row=ri, column=8, value=finding.message)
        ws_findings.cell(row=ri, column=9, value=json.dumps(finding.fields, default=str))

    for col in range(1, len(finding_headers) + 1):
        ws_findings.column_dimensions[get_column_letter(col)].width = 18
    ws_findings.column_dimensions["H"].width = 60
    ws_findings.column_dimensions["I"].width = 40

    summary = summarize_findings(findings, parsed)
    ws_summary = wb.create_sheet("Audit Summary", 1)
    ws_summary["A1"] = "Fuel Refund Report Audit Summary"
    ws_summary["A1"].font = Font(bold=True, size=14)
    row = 3
    ws_summary.cell(row=row, column=1, value="Combined transaction rows")
    ws_summary.cell(row=row, column=2, value=summary["row_count_combined"])
    row += 1
    ws_summary.cell(row=row, column=1, value="Total findings")
    ws_summary.cell(row=row, column=2, value=summary["finding_count"])
    row += 2

    ws_summary.cell(row=row, column=1, value="By severity").font = Font(bold=True)
    row += 1
    for sev, count in summary.get("by_severity", {}).items():
        ws_summary.cell(row=row, column=1, value=sev)
        ws_summary.cell(row=row, column=2, value=count)
        row += 1
    row += 1

    ws_summary.cell(row=row, column=1, value="By check").font = Font(bold=True)
    row += 1
    for check_id, count in summary.get("by_check", {}).items():
        ws_summary.cell(row=row, column=1, value=check_id)
        ws_summary.cell(row=row, column=2, value=count)
        row += 1
    row += 1

    ws_summary.cell(row=row, column=1, value="Refund rate(s)").font = Font(bold=True)
    row += 1
    for rate in parsed.refund_rates:
        ws_summary.cell(row=row, column=1, value=rate.get("label"))
        ws_summary.cell(row=row, column=2, value=rate.get("rate"))
        row += 1
    row += 1

    ws_summary.cell(row=row, column=1, value="Manual follow-up (not automated)").font = Font(bold=True)
    row += 1
    manual = [
        "Final formatting and VAT 201 insert",
        "Eligible Review tab assembly for final submission",
        "Stock adjustments and corrective deductions",
        "Asset rename pass for auto-created assets",
        "Compliance sign-off",
    ]
    for item in manual:
        ws_summary.cell(row=row, column=1, value=f"• {item}")
        row += 1

    if parsed.parse_warnings:
        row += 1
        ws_summary.cell(row=row, column=1, value="Parse warnings").font = Font(bold=True)
        row += 1
        for w in parsed.parse_warnings:
            ws_summary.cell(row=row, column=1, value=w)
            row += 1

    ws_summary.column_dimensions["A"].width = 42
    ws_summary.column_dimensions["B"].width = 24

    wb.save(output_path)
    wb.close()


def build_summary_json(findings: list[Finding], parsed: ParsedWorkbook) -> dict[str, Any]:
    base = summarize_findings(findings, parsed)
    base["findings"] = [f.to_dict() for f in findings]
    return base
