#!/usr/bin/env python3
"""Full coaling extraction from MINING ROM WhatsApp chat."""

import argparse
import re
from pathlib import Path

import pandas as pd

DEFAULT_INPUT = Path(
    "/Users/gemau/Downloads/Copy of WhatsApp Chat with MINING ROM.txt"
)
DEFAULT_OUTPUT = Path(__file__).resolve().parent.parent / "reports" / "mining-rom-coaling-extract.xlsx"

CHAT_FILE = DEFAULT_INPUT
OUTPUT_FILE = DEFAULT_OUTPUT
SOURCE_FILE_NAME = CHAT_FILE.name

MSG_HEADER = re.compile(
    r"^(\d{4}/\d{2}/\d{2}), (\d{2}:\d{2}) - ([^:]+): (.*)$"
)
TMH_IN_TEXT = re.compile(r"TMH\s*@\s*(\d{1,2})[:hH](\d{2})", re.I)
SHIFT_CODE = re.compile(r"shift\s*[_\s]*([a-d])\b", re.I)
STREAM_LINE = re.compile(
    r"^[✓✔•\*°]?\s*(.+?)\s*=\s*([\d\s.,]+)\s*[tT]?\s*$"
)
TOTAL_LINE = re.compile(
    r"^Total\s*(?:(coal|waste|material)\s*)?=\s*([\d\s.,]+)\s*[tT]?\s*$",
    re.I,
)
TOTAL_MATERIAL = re.compile(
    r"Total\s+Material(?:\s+combined)?\s*=\s*\*?([\d\s.,]+)\*?",
    re.I,
)
TOTAL_COAL_WASTE = re.compile(r"^Total\s+(coal|waste)\s*=\s*([\d\s.,]+)", re.I)
SECTION = re.compile(r"^\*(Coal|Waste|Plant|Mining)\*", re.I)
EXC_LINE = re.compile(
    r"^[•°⛔\*]?\s*(?:EXC?|Ex)\s*0*(\d{1,3})\s*[=:\-]?\s*(.+)$",
    re.I,
)
PLANT_LINE = re.compile(
    r"^(DMS|FA|C&S|BYPASS|C/S)\s*=\s*(RUNNING|STANDING|STOPPED|.+)$",
    re.I,
)
REPORT_DATE = re.compile(r"\b(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\b")
DAY_PLAN = re.compile(r"^(DMS|FA|CS/Bypass|C&S/Bypass)\s*:", re.I)
ROM_LINE = re.compile(r"^ROM\s*-\s*([\d\s,]+)t?", re.I)
YIELD_LINE = re.compile(r"^Yield\s*-\s*([\d\s.,]+)%?", re.I)
PRODUCT_LINE = re.compile(r"^Product\s*-\s*([\d\s,]+)t?", re.I)
MAT_PLAN = re.compile(r"^Material\s*-\s*(.+)$", re.I)
FIRST_LOAD = re.compile(r"First load tipped at\s*(\d{1,2})[hH:]?(\d{2})", re.I)
LAST_LOAD = re.compile(r"Last load tipped at\s*(\d{1,2})[hH:]?(\d{2})", re.I)
TRUCK_UNIT = re.compile(
    r"^[⛔•\*]?\s*(?:777)?E\s*0*(\d{1,3})\s*[-=]\s*(.+)$|"
    r"^[⛔•\*]?\s*E\s*0*(\d{1,3})\s*[-=]\s*(.+)$",
    re.I,
)
DOZER_LINE = re.compile(r"Dozer\s*(\d+)", re.I)
SHIFT_TOTAL = re.compile(
    r"Total\s+(?:shift\s+)?(?:coal|waste|material)|Total Material combined",
    re.I,
)
NONE_LINE = re.compile(r"^(none|none\.)$", re.I)


def clean_number(s) -> float | None:
    if s is None:
        return None
    s = re.sub(r"[^\d.,]", "", str(s)).replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def format_line_range(lines: list[int]) -> str:
    if not lines:
        return ""
    u = sorted(set(lines))
    return str(u[0]) if len(u) == 1 else f"{u[0]}-{u[-1]}"


def format_source(parts: list[tuple[str, int, str | None]]) -> str:
    return " | ".join(
        f"{label} (L{ln}){': ' + txt[:55] if txt else ''}"
        for label, ln, txt in parts
        if ln
    )


def base_row(msg_date, msg_time, sender, msg_start_line, report_date=None, shift=None):
    return {
        "Date": report_date,
        "Message_Date": msg_date,
        "Message_Time": msg_time,
        "Sender": sender.strip(),
        "Shift": shift,
        "Source_File": SOURCE_FILE_NAME,
        "Message_Start_Line": msg_start_line,
    }


def parse_report_date(text: str, msg_date: str | None = None) -> str | None:
    candidates = []
    for m in REPORT_DATE.finditer(text):
        d, mo, y = m.groups()
        y = int(y)
        if y < 100:
            y += 2000
        if 2020 <= y <= 2030:
            candidates.append(f"{y:04d}-{int(mo):02d}-{int(d):02d}")
    if not candidates:
        return msg_date.replace("/", "-") if msg_date else None
    if msg_date:
        msg_iso = msg_date.replace("/", "-")
        candidates.sort(
            key=lambda c: abs(
                int(c[:4]) * 400 + int(c[5:7]) * 32 + int(c[8:10])
                - int(msg_iso[:4]) * 400
                - int(msg_iso[5:7]) * 32
                - int(msg_iso[8:10])
            )
        )
        return candidates[0]
    return candidates[0]


def iter_messages(path: Path):
    current = None
    line_no = 0
    with path.open(encoding="utf-8", errors="replace") as f:
        for raw in f:
            line_no += 1
            line = raw.rstrip("\n")
            m = MSG_HEADER.match(line)
            if m:
                if current:
                    yield current
                date, time, sender, first = m.groups()
                current = {
                    "date": date,
                    "time": time,
                    "sender": sender,
                    "start_line": line_no,
                    "body_lines": [],
                }
                if first.strip():
                    current["body_lines"].append((line_no, first.strip()))
            elif current is not None and line.strip():
                current["body_lines"].append((line_no, line.strip()))
        if current:
            yield current


def is_tmh_message(body: str) -> bool:
    return bool(TMH_IN_TEXT.search(body))


def get_shift_from_lines(body_lines) -> str | None:
    for _, line in body_lines:
        sm = SHIFT_CODE.search(line)
        if sm:
            return sm.group(1).upper()
    return None


# ── TMH ──────────────────────────────────────────────────────────────────────

def parse_tmh(msg_date, msg_time, sender, body_lines, msg_start_line):
    body = "\n".join(t for _, t in body_lines)
    hour = None
    m = TMH_IN_TEXT.search(body)
    if m:
        hour = f"{int(m.group(1)):02d}:{m.group(2)}"
    shift = get_shift_from_lines(body_lines)
    report_date = parse_report_date(body, msg_date)
    category = None
    rows = []
    msg_sources = [("WhatsApp message", msg_start_line, f"{msg_date} {msg_time}")]

    for line_no, line in body_lines:
        sm = SHIFT_CODE.search(line)
        if sm:
            shift = sm.group(1).upper()
        hm = TMH_IN_TEXT.search(line)
        if hm:
            hour = f"{int(hm.group(1)):02d}:{hm.group(2)}"
            msg_sources.append(("TMH hour", line_no, line))
        sec = SECTION.match(line)
        if sec:
            category = sec.group(1).capitalize()
            continue

        tcw = TOTAL_COAL_WASTE.match(line)
        if tcw:
            rows.append(_tmh_row(msg_date, msg_time, sender, msg_start_line, report_date, shift, hour, category, f"Total {tcw.group(1)}", clean_number(tcw.group(2)), "total", line_no, msg_sources, tcw.group(1), line))
            continue
        tm = TOTAL_LINE.match(line)
        if tm:
            label = tm.group(1) or "grand"
            rows.append(_tmh_row(msg_date, msg_time, sender, msg_start_line, report_date, shift, hour, category, f"Total {label}", clean_number(tm.group(2)), "total", line_no, msg_sources, "Total", line))
            continue
        if line.lower().startswith("total material"):
            mval = re.search(r"=\s*\*?([\d\s.,]+)\*?", line, re.I)
            if mval:
                rows.append(_tmh_row(msg_date, msg_time, sender, msg_start_line, report_date, shift, hour, category, "Total Material", clean_number(mval.group(1)), "total", line_no, msg_sources, "Total Material", line))
            continue
        tm2 = TOTAL_MATERIAL.search(line)
        if tm2:
            rows.append(_tmh_row(msg_date, msg_time, sender, msg_start_line, report_date, shift, hour, category, "Total Material", clean_number(tm2.group(1)), "total", line_no, msg_sources, "Total Material", line))
            continue
        sm = STREAM_LINE.match(line)
        if sm and not line.lower().startswith("total"):
            stream = sm.group(1).strip()
            tonnes = clean_number(sm.group(2))
            if tonnes is None or stream.lower() in {"total", "total coal", "total waste"}:
                continue
            rows.append(_tmh_row(msg_date, msg_time, sender, msg_start_line, report_date, shift, hour, category, stream, tonnes, "stream", line_no, msg_sources, "Stream", line))
    return rows


def _tmh_row(msg_date, msg_time, sender, msg_start_line, report_date, shift, hour, category, stream, tonnes, row_type, line_no, msg_sources, label, line):
    return {
        **base_row(msg_date, msg_time, sender, msg_start_line, report_date, shift),
        "Hour": hour,
        "Category": category,
        "Stream": stream,
        "Tonnes_Cumulative": tonnes,
        "Row_Type": row_type,
        "Source_Line": line_no,
        "Source_Lines": str(line_no),
        "Source_Of_Information": format_source(msg_sources + [(label, line_no, line)]),
    }


def add_hourly_deltas(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        df["Tonnes_This_Hour"] = None
        return df
    stream_rows = df[df["Row_Type"] == "stream"].copy()
    if stream_rows.empty:
        df["Tonnes_This_Hour"] = None
        return df
    stream_rows = stream_rows.sort_values(["Stream", "Date", "Hour", "Message_Start_Line"])
    stream_rows["Tonnes_This_Hour"] = (
        stream_rows.groupby(["Stream", "Date"], dropna=False)["Tonnes_Cumulative"]
        .diff()
        .clip(lower=0)
    )
    return df.merge(
        stream_rows[["Source_Line", "Message_Start_Line", "Stream", "Tonnes_This_Hour"]],
        on=["Source_Line", "Message_Start_Line", "Stream"],
        how="left",
    )


# ── Shift reports (plant, excavator, equipment, issues) ─────────────────────

def parse_shift_report(msg_date, msg_time, sender, body_lines, msg_start_line):
    body = "\n".join(t for _, t in body_lines)
    report_type = (
        "End" if "END OF SHIFT" in body.upper()
        else "Start" if "START OF SHIFT" in body.upper()
        else "Shift"
    )
    shift = get_shift_from_lines(body_lines)
    report_date = parse_report_date(body, msg_date)

    plants, excavators, trucks, shovels, secondary, issues = [], [], [], [], [], []
    section = None  # trucks, shovel, secondary, issues

    for line_no, line in body_lines:
        low = line.lower().strip()
        if re.match(r"^\*?\s*trucks?\s*\*?$", line, re.I):
            section = "trucks"
            continue
        if re.match(r"^\*?\s*shovel\s*\*?$", line, re.I):
            section = "shovel"
            continue
        if re.match(r"^\*?\s*secondary\s*equipment\s*\*?$", line, re.I):
            section = "secondary"
            continue
        if "shift issues" in low or "shift issue" in low:
            section = "issues"
            continue
        if re.match(r"^\*?\s*(breakdown|mining|plant)\s*", line, re.I):
            section = None
            continue

        sm = SHIFT_CODE.search(line)
        if sm:
            shift = sm.group(1).upper()

        pm = PLANT_LINE.match(line.replace(" ", "")) or PLANT_LINE.match(line)
        if pm:
            plants.append({"Plant": pm.group(1).upper().replace("/", "&"), "Status": pm.group(2).strip(), "Source_Line": line_no})
            continue

        em = EXC_LINE.match(line)
        if em and section != "trucks":
            excavators.append({"Excavator": f"EX{em.group(1)}", "Assignment": em.group(2).strip(), "Source_Line": line_no})
            continue

        if section == "trucks" and not NONE_LINE.match(low):
            tu = TRUCK_UNIT.match(line)
            if tu:
                uid = tu.group(1) or tu.group(3)
                detail = (tu.group(2) or tu.group(4) or "").strip()
                trucks.append({"Unit": f"E{uid}", "Detail": detail, "Source_Line": line_no})
            elif len(line) > 2 and not line.startswith("*"):
                trucks.append({"Unit": None, "Detail": line, "Source_Line": line_no})
        elif section == "shovel" and not NONE_LINE.match(low):
            if len(line) > 2:
                shovels.append({"Detail": line, "Source_Line": line_no})
        elif section == "secondary" and not NONE_LINE.match(low):
            if len(line) > 2:
                secondary.append({"Detail": line, "Source_Line": line_no})
        elif section == "issues":
            if len(line) > 2 and not line.startswith("*_"):
                issues.append({"Detail": line.lstrip("•- "), "Source_Line": line_no})

    base = base_row(msg_date, msg_time, sender, msg_start_line, report_date, shift)
    base["Report_Type"] = report_type

    rows = {"plant": [], "excavator": [], "truck": [], "shovel": [], "secondary": [], "issue": []}

    def add_records(items, record_type, unit_key="Unit"):
        for item in items:
            r = {
                **base,
                "Record_Type": record_type,
                "Source_Line": item["Source_Line"],
                "Source_Lines": str(item["Source_Line"]),
                "Source_Of_Information": format_source([
                    ("Shift report", msg_start_line, report_type),
                    (record_type, item["Source_Line"], item.get("Detail") or item.get("Assignment") or item.get("Status")),
                ]),
            }
            if record_type == "Plant":
                r["Plant"] = item["Plant"]
                r["Status"] = item["Status"]
            elif record_type == "Excavator":
                r["Excavator"] = item["Excavator"]
                r["Assignment"] = item["Assignment"]
            elif record_type in ("Truck", "Shovel", "Secondary"):
                r[unit_key] = item.get(unit_key)
                r["Detail"] = item.get("Detail")
            else:
                r["Detail"] = item["Detail"]
            rows[record_type.lower() if record_type != "Secondary" else "secondary"].append(r)

    add_records(plants, "Plant")
    add_records(excavators, "Excavator")
    for t in trucks:
        rows["truck"].append({
            **base, "Record_Type": "Truck", "Unit": t.get("Unit"), "Detail": t["Detail"],
            "Source_Line": t["Source_Line"], "Source_Lines": str(t["Source_Line"]),
            "Source_Of_Information": format_source([("Shift report", msg_start_line, report_type), ("Truck", t["Source_Line"], t["Detail"])]),
        })
    for s in shovels:
        rows["shovel"].append({
            **base, "Record_Type": "Shovel", "Detail": s["Detail"],
            "Source_Line": s["Source_Line"], "Source_Lines": str(s["Source_Line"]),
            "Source_Of_Information": format_source([("Shift report", msg_start_line, report_type), ("Shovel", s["Source_Line"], s["Detail"])]),
        })
    for s in secondary:
        rows["secondary"].append({
            **base, "Record_Type": "Secondary", "Detail": s["Detail"],
            "Source_Line": s["Source_Line"], "Source_Lines": str(s["Source_Line"]),
            "Source_Of_Information": format_source([("Shift report", msg_start_line, report_type), ("Secondary", s["Source_Line"], s["Detail"])]),
        })
    for i in issues:
        rows["issue"].append({
            **base, "Record_Type": "Shift Issue", "Detail": i["Detail"],
            "Source_Line": i["Source_Line"], "Source_Lines": str(i["Source_Line"]),
            "Source_Of_Information": format_source([("Shift report", msg_start_line, report_type), ("Issue", i["Source_Line"], i["Detail"])]),
        })

    return rows


# ── Day plans ────────────────────────────────────────────────────────────────

def parse_day_plan(msg_date, msg_time, sender, body_lines, msg_start_line):
    current_plant = None
    rows = []
    report_date = parse_report_date("\n".join(t for _, t in body_lines), msg_date)
    for line_no, line in body_lines:
        dm = DAY_PLAN.match(line)
        if dm:
            current_plant = dm.group(1).upper()
            continue
        if not current_plant:
            continue
        mat = rom = yield_v = product = None
        mm = MAT_PLAN.match(line)
        if mm:
            mat = mm.group(1).strip()
        rm = ROM_LINE.match(line)
        if rm:
            rom = clean_number(rm.group(1))
        ym = YIELD_LINE.match(line)
        if ym:
            yield_v = clean_number(ym.group(1))
        pm = PRODUCT_LINE.match(line)
        if pm:
            product = clean_number(pm.group(1))
        if any(v is not None for v in (mat, rom, yield_v, product)):
            rows.append({
                **base_row(msg_date, msg_time, sender, msg_start_line, report_date),
                "Plant": current_plant, "Material": mat, "ROM_Target_t": rom,
                "Yield_pct": yield_v, "Product_Target_t": product,
                "Source_Line": line_no, "Source_Lines": str(line_no),
                "Source_Of_Information": format_source([("Day plan", msg_start_line, current_plant), ("Line", line_no, line)]),
            })
    return rows


# ── Other message types ──────────────────────────────────────────────────────

def parse_load_milestones(msg_date, msg_time, sender, body_lines, msg_start_line):
    rows = []
    report_date = parse_report_date("\n".join(t for _, t in body_lines), msg_date)
    shift = get_shift_from_lines(body_lines)
    for line_no, line in body_lines:
        fm = FIRST_LOAD.search(line)
        if fm:
            rows.append({
                **base_row(msg_date, msg_time, sender, msg_start_line, report_date, shift),
                "Event": "First load tipped", "Time": f"{int(fm.group(1)):02d}:{fm.group(2)}",
                "Source_Line": line_no, "Source_Lines": str(line_no),
                "Source_Of_Information": format_source([("Milestone", line_no, line)]),
            })
        lm = LAST_LOAD.search(line)
        if lm:
            rows.append({
                **base_row(msg_date, msg_time, sender, msg_start_line, report_date, shift),
                "Event": "Last load tipped", "Time": f"{int(lm.group(1)):02d}:{lm.group(2)}",
                "Source_Line": line_no, "Source_Lines": str(line_no),
                "Source_Of_Information": format_source([("Milestone", line_no, line)]),
            })
    return rows


def parse_blasting(msg_date, msg_time, sender, body_lines, msg_start_line):
    body = "\n".join(t for _, t in body_lines)
    if "blast" not in body.lower():
        return []
    rows = []
    report_date = parse_report_date(body, msg_date)
    pit = block = material = blast_time = None
    for line_no, line in body_lines:
        if re.search(r"pit\s*:", line, re.I):
            pit = line.split(":", 1)[-1].strip()
        if re.search(r"block\s*:", line, re.I):
            block = line.split(":", 1)[-1].strip()
        if re.search(r"material\s*:", line, re.I) and "notification" not in line.lower():
            material = line.split(":", 1)[-1].strip()
        bt = re.search(r"blast(?:ing)?\s*time\s*[:=]?\s*(.+)", line, re.I)
        if bt:
            blast_time = bt.group(1).strip()
    rows.append({
        **base_row(msg_date, msg_time, sender, msg_start_line, report_date),
        "Pit": pit, "Block": block, "Material": material, "Blast_Time": blast_time,
        "Summary": body[:500].replace("\n", " | "),
        "Source_Line": msg_start_line, "Source_Lines": format_line_range([ln for ln, _ in body_lines]),
        "Source_Of_Information": format_source([("Blast notification", msg_start_line, body[:60])]),
    })
    return rows


def parse_delays(msg_date, msg_time, sender, body_lines, msg_start_line):
    rows = []
    report_date = parse_report_date("\n".join(t for _, t in body_lines), msg_date)
    shift = get_shift_from_lines(body_lines)
    keywords = ("delay", "standing", "blocked", "stopped", "blast", "breakdown", "waiting")
    for line_no, line in body_lines:
        low = line.lower()
        if any(k in low for k in keywords) and len(line) > 10:
            if not re.match(r"^(breakdown|delays|shift issues)\s*$", low, re.I):
                rows.append({
                    **base_row(msg_date, msg_time, sender, msg_start_line, report_date, shift),
                    "Delay_Note": line.lstrip("•- "),
                    "Source_Line": line_no, "Source_Lines": str(line_no),
                    "Source_Of_Information": format_source([("Delay", line_no, line)]),
                })
    return rows


def parse_shift_totals(msg_date, msg_time, sender, body_lines, msg_start_line):
    body = "\n".join(t for _, t in body_lines)
    if "total shift production" not in body.lower() and "total material combined" not in body.lower():
        if not re.search(r"Total\s+(coal|waste)\s*=", body, re.I):
            return []
    rows = []
    report_date = parse_report_date(body, msg_date)
    shift = get_shift_from_lines(body_lines)
    for line_no, line in body_lines:
        tcw = TOTAL_COAL_WASTE.match(line)
        if tcw:
            rows.append({
                **base_row(msg_date, msg_time, sender, msg_start_line, report_date, shift),
                "Metric": f"Total {tcw.group(1)}", "Tonnes": clean_number(tcw.group(2)),
                "Source_Line": line_no, "Source_Lines": str(line_no),
                "Source_Of_Information": format_source([("Shift total", line_no, line)]),
            })
        if "total material" in line.lower():
            mval = re.search(r"=\s*\*?([\d\s.,]+)\*?", line, re.I)
            if mval:
                rows.append({
                    **base_row(msg_date, msg_time, sender, msg_start_line, report_date, shift),
                    "Metric": "Total Material", "Tonnes": clean_number(mval.group(1)),
                    "Source_Line": line_no, "Source_Lines": str(line_no),
                    "Source_Of_Information": format_source([("Shift total", line_no, line)]),
                })
    return rows


def parse_plant_updates(msg_date, msg_time, sender, body_lines, msg_start_line):
    body = "\n".join(t for _, t in body_lines)
    if "plant update" not in body.lower() and not re.search(r"DMS\s+(still\s+)?standing", body, re.I):
        return []
    rows = []
    report_date = parse_report_date(body, msg_date)
    for line_no, line in body_lines:
        if re.search(r"(DMS|FA|C&S|BYPASS).*(running|standing)", line, re.I) or "plant update" in line.lower():
            rows.append({
                **base_row(msg_date, msg_time, sender, msg_start_line, report_date),
                "Update": line,
                "Source_Line": line_no, "Source_Lines": str(line_no),
                "Source_Of_Information": format_source([("Plant update", line_no, line)]),
            })
    return rows


def build_plan_vs_actual(df_plan, df_tmh):
    if df_plan.empty or df_tmh.empty:
        return pd.DataFrame()
    totals = df_tmh[df_tmh["Row_Type"] == "total"].copy()
    grand = totals[totals["Stream"].str.contains("Material|grand", case=False, na=False)]
    if grand.empty:
        grand = totals.groupby(["Date", "Shift"]).last().reset_index()
    actual = grand.groupby("Date", dropna=False).agg(
        Actual_Tonnes=("Tonnes_Cumulative", "max")
    ).reset_index()
    plan = df_plan.groupby("Date", dropna=False).agg(
        Planned_ROM_t=("ROM_Target_t", "sum"),
        Planned_Product_t=("Product_Target_t", "sum"),
    ).reset_index()
    return plan.merge(actual, on="Date", how="outer")


def main(chat_file: Path = CHAT_FILE, output_file: Path = OUTPUT_FILE):
    global SOURCE_FILE_NAME
    SOURCE_FILE_NAME = chat_file.name
    data = {
        "tmh": [], "plant": [], "excavator": [], "truck": [], "shovel": [],
        "secondary": [], "issue": [], "plan": [], "milestone": [], "blast": [],
        "delay": [], "shift_total": [], "plant_update": [],
    }
    stats = {k: 0 for k in ["messages", "tmh", "shift", "plan", "milestone", "blast", "delay", "shift_total", "plant_update", "other"]}

    for msg in iter_messages(chat_file):
        stats["messages"] += 1
        body = "\n".join(t for _, t in msg["body_lines"])
        parsed = False

        if is_tmh_message(body):
            stats["tmh"] += 1
            data["tmh"].extend(parse_tmh(msg["date"], msg["time"], msg["sender"], msg["body_lines"], msg["start_line"]))
            data["delay"].extend(parse_delays(msg["date"], msg["time"], msg["sender"], msg["body_lines"], msg["start_line"]))
            parsed = True

        if "START OF SHIFT" in body.upper() or "END OF SHIFT" in body.upper():
            stats["shift"] += 1
            sr = parse_shift_report(msg["date"], msg["time"], msg["sender"], msg["body_lines"], msg["start_line"])
            for k in ("plant", "excavator", "truck", "shovel", "secondary", "issue"):
                data[k].extend(sr[k])
            parsed = True

        if "day plan" in body.lower() or ("ROM -" in body and "Yield -" in body):
            stats["plan"] += 1
            data["plan"].extend(parse_day_plan(msg["date"], msg["time"], msg["sender"], msg["body_lines"], msg["start_line"]))
            parsed = True

        ms = parse_load_milestones(msg["date"], msg["time"], msg["sender"], msg["body_lines"], msg["start_line"])
        if ms:
            stats["milestone"] += 1
            data["milestone"].extend(ms)
            parsed = True

        bl = parse_blasting(msg["date"], msg["time"], msg["sender"], msg["body_lines"], msg["start_line"])
        if bl:
            stats["blast"] += 1
            data["blast"].extend(bl)
            parsed = True

        st = parse_shift_totals(msg["date"], msg["time"], msg["sender"], msg["body_lines"], msg["start_line"])
        if st:
            stats["shift_total"] += 1
            data["shift_total"].extend(st)
            parsed = True

        pu = parse_plant_updates(msg["date"], msg["time"], msg["sender"], msg["body_lines"], msg["start_line"])
        if pu:
            stats["plant_update"] += 1
            data["plant_update"].extend(pu)
            parsed = True

        if not parsed and any(k in body.lower() for k in ("delay", "blast", "standing")):
            data["delay"].extend(parse_delays(msg["date"], msg["time"], msg["sender"], msg["body_lines"], msg["start_line"]))

        if not parsed:
            stats["other"] += 1

    df_tmh = pd.DataFrame(data["tmh"])
    if not df_tmh.empty:
        df_tmh = add_hourly_deltas(df_tmh).sort_values(["Date", "Hour", "Stream"], na_position="last", kind="mergesort")

    df_plant = pd.DataFrame(data["plant"])
    df_exc = pd.DataFrame(data["excavator"])
    df_truck = pd.DataFrame(data["truck"])
    df_shovel = pd.DataFrame(data["shovel"])
    df_secondary = pd.DataFrame(data["secondary"])
    df_issues = pd.DataFrame(data["issue"])
    df_plan = pd.DataFrame(data["plan"])
    df_milestone = pd.DataFrame(data["milestone"])
    df_blast = pd.DataFrame(data["blast"])
    df_delay = pd.DataFrame(data["delay"]).drop_duplicates(subset=["Message_Start_Line", "Source_Line", "Delay_Note"]) if data["delay"] else pd.DataFrame()
    df_shift_total = pd.DataFrame(data["shift_total"])
    df_plant_upd = pd.DataFrame(data["plant_update"])
    df_pva = build_plan_vs_actual(df_plan, df_tmh)

    # Combined equipment sheet
    equip_parts = []
    for df, typ in [(df_truck, "Truck"), (df_shovel, "Shovel"), (df_secondary, "Secondary")]:
        if not df.empty:
            e = df.copy()
            e["Equipment_Type"] = typ
            equip_parts.append(e)
    df_equipment = pd.concat(equip_parts, ignore_index=True) if equip_parts else pd.DataFrame()

    readme = pd.DataFrame([
        {"Sheet": "TMH_Tonnes", "Contents": "Hourly cumulative tonnes per material stream; use Tonnes_This_Hour for hourly delta"},
        {"Sheet": "Shift_Plant", "Contents": "DMS/FA/C&S/Bypass status at shift start/end"},
        {"Sheet": "Shift_Excavators", "Contents": "Excavator assignments (routing, not load counts)"},
        {"Sheet": "Truck_Breakdowns", "Contents": "Truck unit downtime (E1, E7, etc.) from shift reports"},
        {"Sheet": "Shovel_Secondary", "Contents": "Shovel and secondary equipment notes"},
        {"Sheet": "Shift_Issues", "Contents": "Shift issue bullets from formal reports"},
        {"Sheet": "Delays_Events", "Contents": "Delay/production/standing notes from TMH and chat"},
        {"Sheet": "Blasting", "Contents": "Blast notifications"},
        {"Sheet": "Load_Milestones", "Contents": "First/last load tipped times"},
        {"Sheet": "Shift_Totals", "Contents": "End-of-shift total coal/waste/material tonnes"},
        {"Sheet": "Plant_Updates", "Contents": "Ad-hoc plant status updates"},
        {"Sheet": "Day_Plans", "Contents": "ROM/yield/product targets"},
        {"Sheet": "Plan_vs_Actual", "Contents": "Daily plan ROM vs TMH actual (approximate)"},
        {"Sheet": "Equipment_All", "Contents": "Combined trucks, shovel, secondary"},
    ])

    output_file.parent.mkdir(parents=True, exist_ok=True)
    with pd.ExcelWriter(output_file, engine="openpyxl") as writer:
        df_tmh.to_excel(writer, sheet_name="TMH_Tonnes", index=False)
        df_plant.to_excel(writer, sheet_name="Shift_Plant", index=False)
        df_exc.to_excel(writer, sheet_name="Shift_Excavators", index=False)
        df_truck.to_excel(writer, sheet_name="Truck_Breakdowns", index=False)
        if not df_shovel.empty or not df_secondary.empty:
            pd.concat([df_shovel, df_secondary], ignore_index=True).to_excel(
                writer, sheet_name="Shovel_Secondary", index=False
            )
        df_issues.to_excel(writer, sheet_name="Shift_Issues", index=False)
        df_delay.to_excel(writer, sheet_name="Delays_Events", index=False)
        df_blast.to_excel(writer, sheet_name="Blasting", index=False)
        df_milestone.to_excel(writer, sheet_name="Load_Milestones", index=False)
        df_shift_total.to_excel(writer, sheet_name="Shift_Totals", index=False)
        df_plant_upd.to_excel(writer, sheet_name="Plant_Updates", index=False)
        df_plan.to_excel(writer, sheet_name="Day_Plans", index=False)
        df_pva.to_excel(writer, sheet_name="Plan_vs_Actual", index=False)
        df_equipment.to_excel(writer, sheet_name="Equipment_All", index=False)
        readme.to_excel(writer, sheet_name="Readme", index=False)

    print(f"Written: {output_file}")
    print(f"Messages: {stats['messages']:,}")
    for label, count, rows in [
        ("TMH", stats["tmh"], len(df_tmh)),
        ("Shift reports", stats["shift"], len(df_plant) + len(df_exc)),
        ("Truck breakdowns", stats["shift"], len(df_truck)),
        ("Shift issues", stats["shift"], len(df_issues)),
        ("Day plans", stats["plan"], len(df_plan)),
        ("Milestones", stats["milestone"], len(df_milestone)),
        ("Blasting", stats["blast"], len(df_blast)),
        ("Delays", "-", len(df_delay)),
        ("Shift totals", stats["shift_total"], len(df_shift_total)),
        ("Plant updates", stats["plant_update"], len(df_plant_upd)),
    ]:
        print(f"  {label}: {rows:,} rows")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract MINING ROM coaling WhatsApp chat to Excel")
    parser.add_argument("input", nargs="?", default=str(DEFAULT_INPUT), help="Path to WhatsApp .txt export")
    parser.add_argument("output", nargs="?", default=str(DEFAULT_OUTPUT), help="Output .xlsx path")
    args = parser.parse_args()
    main(Path(args.input), Path(args.output))
