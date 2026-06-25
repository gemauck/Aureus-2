#!/usr/bin/env python3
"""Export reports/incident-reporting-plan.html plan body to a Word-openable .doc file."""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "reports" / "incident-reporting-plan.html"

WORD_STYLES = """
body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #111827; line-height: 1.45; }
h1 { font-size: 22pt; font-weight: bold; margin: 0 0 8pt; }
h2 { font-size: 14pt; font-weight: bold; margin: 18pt 0 8pt; page-break-after: avoid; }
h3 { font-size: 12pt; font-weight: bold; margin: 12pt 0 6pt; }
p, li { margin: 0 0 6pt; }
table { border-collapse: collapse; width: 100%; margin: 8pt 0 12pt; }
th, td { border: 1px solid #cbd5e1; padding: 6pt 8pt; vertical-align: top; text-align: left; }
th { background: #f1f5f9; font-weight: bold; }
ul, ol { margin: 6pt 0 10pt 18pt; }
.severity-critical { background: #fef2f2; border: 1px solid #fecaca; padding: 8pt; margin-bottom: 8pt; }
.severity-high { background: #fff7ed; border: 1px solid #fed7aa; padding: 8pt; margin-bottom: 8pt; }
.severity-medium { background: #fffbeb; border: 1px solid #fde68a; padding: 8pt; margin-bottom: 8pt; }
.severity-low { background: #f0fdf4; border: 1px solid #bbf7d0; padding: 8pt; margin-bottom: 8pt; }
section { margin-bottom: 16pt; }
code { font-family: Consolas, monospace; background: #f3f4f6; padding: 1pt 3pt; }
""".strip()


def extract_plan_body(html: str) -> str:
    marker = '<div id="plan-body"'
    start = html.find(marker)
    if start < 0:
        raise SystemExit("plan-body not found in HTML")
    start = html.find(">", start) + 1
    end = html.find("</div><!-- /plan-body -->", start)
    if end < 0:
        raise SystemExit("plan-body end marker not found")
    body = html[start:end]
    body = re.sub(r'\scontenteditable="[^"]*"', "", body)
    body = re.sub(r"<i[^>]*class=\"[^\"]*fa-[^\"]*\"[^>]*></i>", "", body)
    body = re.sub(r'<div class="[^"]*no-print-hint[^"]*"[^>]*>.*?</div>\s*', "", body, flags=re.S)
    return body


def build_word_doc(body: str) -> str:
    return (
        '<html xmlns:o="urn:schemas-microsoft-com:office:office" '
        'xmlns:w="urn:schemas-microsoft-com:office:word" '
        'xmlns="http://www.w3.org/TR/REC-html40">'
        "<head><meta charset=\"utf-8\">"
        "<title>Incident Reporting Plan — Abcotronics</title>"
        "<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom>"
        "</w:WordDocument></xml><![endif]-->"
        f"<style>{WORD_STYLES}</style></head><body>{body}</body></html>"
    )


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "Desktop" / "incident-reporting-plan.doc"
    html = SRC.read_text(encoding="utf-8")
    doc = build_word_doc(extract_plan_body(html))
    out.write_bytes("\ufeff".encode("utf-8") + doc.encode("utf-8"))
    print(out)


if __name__ == "__main__":
    main()
