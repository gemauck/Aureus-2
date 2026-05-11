#!/usr/bin/env python3
"""
Build intuitive extracts from production-report-june-2024-extracted CSVs:
  - Sheet index by theme (pits, loads, assets, downtime, etc.)
  - Normalized loads (Total loads + EM Loads sheets melted by asset)
  - Machine hour snapshots + derived daily deltas per asset
"""

from __future__ import annotations

import csv
import json
from datetime import datetime
from pathlib import Path


def parse_iso_date(val: str | None) -> str | None:
    if val is None or val == "":
        return None
    s = str(val).strip()
    if not s:
        return None
    if "T" in s:
        return s.split("T", 1)[0]
    return s


def num(v) -> float | None:
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(",", "")
    if not s or s.startswith("#"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def read_csv_rows(path: Path) -> list[list[str]]:
    with open(path, newline="", encoding="utf-8") as f:
        return [list(row) for row in csv.reader(f)]


def pad(row: list[str], n: int) -> list[str]:
    return row + [""] * (n - len(row))


def write_csv(path: Path, header: list[str], rows: list[list]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        for r in rows:
            w.writerow(r)


SHEET_CATEGORIES: dict[str, tuple[str, str]] = {
    " South Pit hards": ("pit_team_detail", "Loads/m³ by truck team — South Pit hards"),
    "NP2": ("pit_team_detail", "Loads/m³ by truck team — NP2"),
    "Luhlanga": ("pit_team_detail", "Loads/m³ by truck team — Luhlanga"),
    "KwaQubuka hards": ("pit_team_detail", "Loads/m³ by truck team — KwaQubuka hards"),
    "Softs": ("pit_team_detail", "Loads/m³ by truck team — softs"),
    "north pit 1 coal": ("pit_coal", "Coal pit — north pit 1"),
    "South Pit coal": ("pit_coal", "Coal pit — South Pit"),
    "north pit 2 coal": ("pit_coal", "Coal pit — north pit 2"),
    "Luhlanga Pit coal ": ("pit_coal", "Coal pit — Luhlanga"),
    "KwaQubuka Pit coal": ("pit_coal", "Coal pit — KwaQubuka"),
    "SUMMARY (2)": ("summary_wide", "Secondary summary matrix"),
    "Day Shift TR60": ("fleet_tr60_template", "TR60 productivity template / historical rows"),
    "Night Shift TR60": ("fleet_tr60_template", "TR60 productivity template / historical rows"),
    "Hours worked per shift": ("labour_shifts", "Hours worked per shift"),
    "Eng Downtime Avail": ("engineering", "Engineering availability / downtime"),
    "Eng Downtime": ("engineering", "Engineering downtime detail"),
    "Diesel": ("fuel", "Diesel consumption"),
    "Machine Hours": ("assets_hours", "Fleet meter hours by asset (opening/closing rows)"),
    "EM Loads Topsoil": ("loads_by_asset", "Emalahleni loads count per asset — topsoil"),
    "EM Loads Softs": ("loads_by_asset", "Emalahleni loads count per asset — softs"),
    "EM Loads Hards": ("loads_by_asset", "Emalahleni loads count per asset — hards"),
    "EM Topsoil": ("material_volume", "EM volumes — topsoil"),
    "EM Softs": ("material_volume", "EM volumes — softs"),
    "EM Hards": ("material_volume", "EM volumes — hards"),
    "DAILY INPUTS": ("daily_inputs", "Daily operational inputs (wide)"),
    "SUMMARY": ("summary_wide", "Primary summary matrix"),
    "Total loads": ("loads_mine_total", "Mine-wide loads + BCM totals (TR groups + grand total)"),
    "Drilling": ("drilling", "Drilling"),
    "Area 1 SP": ("area_production", "Area 1 South Pit production"),
    "Jan report": ("reference", "January reference / carry-over"),
    "Emalahleni": ("area_production", "Emalahleni area production"),
    "Area 9": ("area_production", "Area 9 production"),
    "Area 1 NP2": ("area_production", "Area 1 NP2 production"),
    "TOTAL MINE": ("mine_rollups", "Mine-wide daily KPI roll-up"),
    "Dashboard": ("dashboard", "Executive dashboard"),
    "Dump truck": ("fleet_dump", "Dump truck"),
    "Rate": ("reference", "Rates reference"),
    "Sheet1": ("empty", "Empty"),
    "Johan_graphs": ("empty", "Empty placeholder"),
    "Johan_data": ("reference", "Johan supporting data"),
}


def extract_total_loads(csv_dir: Path) -> tuple[list[str], list[list]]:
    rows = read_csv_rows(csv_dir / "Total_loads.csv")
    # Row index 2: Date, Shift, loads, BCM's, loads, BCM's, (gap), Total loads, BCM's Total, (gap), 100+777, ADT
    header = [
        "calendar_date",
        "shift",
        "loads_group_a",
        "bcm_group_a",
        "loads_group_b",
        "bcm_group_b",
        "total_loads",
        "total_bcm",
        "bcm_split_100_plus_777",
        "bcm_split_adt",
        "notes",
    ]
    out: list[list] = []
    current_date: str | None = None
    for i, raw in enumerate(rows):
        if i < 3:
            continue
        r = raw + [""] * (20 - len(raw))
        d = parse_iso_date(r[0])
        shift = (r[1] or "").strip()
        if d:
            current_date = d
        if not current_date:
            continue
        notes = ""
        for c in r[12:]:
            if not c or not str(c).strip():
                continue
            if num(c) is not None:
                continue
            notes = str(c).strip()
            break
        out.append(
            [
                current_date,
                shift or "",
                num(r[2]),
                num(r[3]),
                num(r[4]),
                num(r[5]),
                num(r[7]),
                num(r[8]),
                num(r[10]),
                num(r[11]),
                notes,
            ]
        )
    return header, out


def extract_em_loads_long(csv_dir: Path) -> tuple[list[str], list[list]]:
    header = ["calendar_date", "calendar_day_label", "shifts", "material", "asset_id", "loads"]
    material_map = {
        "EM_Loads_Topsoil.csv": "topsoil",
        "EM_Loads_Softs.csv": "softs",
        "EM_Loads_Hards.csv": "hards",
    }
    out: list[list] = []
    for fname, mat in material_map.items():
        path = csv_dir / fname
        if not path.exists():
            continue
        rows = read_csv_rows(path)
        hdr_i = next((i for i, row in enumerate(rows) if row and row[0].strip().upper() == "DATE"), None)
        if hdr_i is None:
            continue
        hdr = rows[hdr_i]
        assets = [h.strip() for h in hdr[5:] if h and str(h).strip()]
        for raw in rows[hdr_i + 1 :]:
            if not raw or not any(x.strip() for x in raw[:5]):
                continue
            d = parse_iso_date(raw[0])
            if not d:
                continue
            day_lbl = parse_iso_date(raw[1]) or (raw[1] or "").strip()
            shifts = (raw[3] or "").strip()
            wide = pad(raw, 5 + len(assets))
            for j, aid in enumerate(assets):
                v = num(wide[5 + j])
                if v is not None and v != 0:
                    out.append([d, day_lbl, shifts, mat, aid, v])
    return header, out


def extract_machine_hours(csv_dir: Path) -> tuple[list[str], list[list], list[str], list[list]]:
    """Snapshots: one row per date × snapshot_label × asset; derived: daily delta Closing Day - Opening Hr."""
    path = csv_dir / "Machine_Hours.csv"
    rows = read_csv_rows(path)
    hdr_i = next((i for i, row in enumerate(rows) if row and row[0].strip().upper() == "DATE"), None)
    if hdr_i is None:
        return [], [], [], []

    hdr = rows[hdr_i]
    # Skip empty column after A/F/O
    start = 6
    assets = []
    for h in hdr[start:]:
        if h is None:
            continue
        t = str(h).strip()
        if t:
            assets.append(t)

    snap_header = ["calendar_date", "snapshot_label", "asset_id", "meter_or_hours"]
    snap_out: list[list] = []

    current_date: str | None = None
    for raw in rows[hdr_i + 1 :]:
        wide = pad(raw, start + len(assets))
        d = parse_iso_date(wide[0])
        if d:
            current_date = d
        if not current_date:
            continue
        label = (wide[5] or "").strip()
        if not label:
            continue
        if label not in ("Opening Hr", "Closing Day", "Closing Aft"):
            continue
        for j, aid in enumerate(assets):
            v = num(wide[start + j])
            if v is None:
                continue
            snap_out.append([current_date, label, aid, v])

    # Derived: per date, Closing Day - Opening Hr
    from collections import defaultdict

    by_date_asset: dict[tuple[str, str], dict[str, float]] = defaultdict(dict)
    for row in snap_out:
        cd, lab, aid, v = row
        by_date_asset[(cd, aid)][lab] = float(v)

    derived_header = ["calendar_date", "asset_id", "hours_opening_to_closing_day", "opening_hr", "closing_day"]
    derived_out: list[list] = []
    for (cd, aid), labs in sorted(by_date_asset.items()):
        op = labs.get("Opening Hr")
        cl = labs.get("Closing Day")
        if op is None or cl is None:
            continue
        derived_out.append([cd, aid, round(cl - op, 6), op, cl])

    return snap_header, snap_out, derived_header, derived_out


def extract_pit_daily_totals(csv_dir: Path, manifest_sheets: list[dict]) -> tuple[list[str], list[list]]:
    """Pull Date/Shift + Daily act tot column from pit_team_detail sheets."""
    header = ["area_sheet", "calendar_date", "shift", "daily_actual_total_m3", "target_total"]
    pit_names = [
        " South Pit hards",
        "NP2",
        "Luhlanga",
        "KwaQubuka hards",
        "Softs",
    ]
    file_by_name = {m["name"]: m["csv_file"] for m in manifest_sheets}
    out: list[list] = []

    for name in pit_names:
        rel = file_by_name.get(name)
        if not rel:
            continue
        path = csv_dir.parent / rel
        rows = read_csv_rows(path)
        hdr_i = next((i for i, row in enumerate(rows) if row and row[0].strip().lower() == "date"), None)
        if hdr_i is None:
            continue
        hdr = rows[hdr_i]
        try:
            idx_daily = next(i for i, c in enumerate(hdr) if c and "daily act tot" in c.lower())
        except StopIteration:
            continue

        current_date: str | None = None
        for raw in rows[hdr_i + 1 :]:
            wide = raw + [""] * (len(hdr) + 10 - len(raw))
            d = parse_iso_date(wide[0])
            shift = (wide[1] or "").strip()
            if d:
                current_date = d
            if not current_date:
                continue
            # Values are often shifted right vs header labels; take numeric tail from "Daily act tot" onward
            tail_nums = []
            for c in wide[idx_daily:]:
                n = num(c)
                if n is not None:
                    tail_nums.append(n)
            while len(tail_nums) > 1 and tail_nums[0] == 0:
                tail_nums.pop(0)
            dv = tail_nums[0] if tail_nums else None
            tv = tail_nums[1] if len(tail_nums) > 1 else None
            if dv is None and tv is None:
                continue
            out.append([name.strip(), current_date, shift, dv, tv])

    return header, out


def build_sheet_index(manifest_path: Path) -> tuple[list[str], list[list]]:
    with open(manifest_path, encoding="utf-8") as f:
        manifest = json.load(f)
    header = ["sheet_name", "category", "description", "rows_exported", "csv_file"]
    rows_out: list[list] = []
    for s in manifest.get("sheets", []):
        name = s["name"]
        cat, desc = SHEET_CATEGORIES.get(name, ("uncategorized", "See raw CSV"))
        rows_out.append([name, cat, desc, s.get("rows_exported"), s.get("csv_file")])
    return header, rows_out


def write_readme(out_dir: Path, generated_at: str) -> None:
    text = f"""# Production Report — intuitive extracts

Generated: {generated_at}

## What to open first

| File | Purpose |
|------|---------|
| `sheet_index.csv` | Every worksheet labeled by **theme** (pits, loads, assets, fuel, etc.). |
| `loads_mine_total_daily.csv` | **Mine-wide** loads and BCM by **date + shift** (`Total loads` sheet). |
| `loads_emalahleni_by_asset.csv` | **Per-asset load counts** for topsoil / softs / hards (`EM Loads *` sheets, long format). |
| `machine_hours_snapshots.csv` | Raw **hour-meter style** rows: Opening / Closing Day per asset. |
| `machine_hours_daily_derived.csv` | **Approx. hours per calendar day** = Closing Day − Opening Hr (same sheet). |
| `pit_daily_rollups.csv` | **Daily actual m³** roll-up per pit team sheet (where `Daily act tot` exists). |

## Themes (categories)

- **pit_team_detail** — Wide tables: teams × TR100/TR60/ADT × loads and m³.
- **loads_mine_total** — Single sheet summarising **total loads + BCM** for the mine.
- **loads_by_asset** — Emalahleni **load counts** per machine (VEX, ADT, VAD, dozers, etc.).
- **assets_hours** — **Machine Hours** cumulative meters; use snapshots or derived daily deltas.
- **mine_rollups** / **dashboard** — Consolidated KPI-style views (`TOTAL MINE`, `Dashboard`).

## Raw data

All original per-sheet CSVs remain in `../csv/`.

"""
    (out_dir / "README.md").write_text(text, encoding="utf-8")


def main() -> None:
    base = Path(__file__).resolve().parents[1] / "reports" / "production-report-june-2024-extracted"
    csv_dir = base / "csv"
    manifest_path = base / "manifest.json"
    out_dir = base / "intuitive"
    out_dir.mkdir(parents=True, exist_ok=True)

    generated_at = datetime.now().isoformat()

    with open(manifest_path, encoding="utf-8") as f:
        manifest = json.load(f)

    # Sheet index
    h, r = build_sheet_index(manifest_path)
    write_csv(out_dir / "sheet_index.csv", h, r)

    # Total loads
    h, r = extract_total_loads(csv_dir)
    write_csv(out_dir / "loads_mine_total_daily.csv", h, r)

    # EM loads long
    h, r = extract_em_loads_long(csv_dir)
    write_csv(out_dir / "loads_emalahleni_by_asset.csv", h, r)

    # Machine hours
    sh, sr, dh, dr = extract_machine_hours(csv_dir)
    if sr:
        write_csv(out_dir / "machine_hours_snapshots.csv", sh, sr)
    if dr:
        write_csv(out_dir / "machine_hours_daily_derived.csv", dh, dr)

    # Pit rollups
    h, r = extract_pit_daily_totals(csv_dir, manifest.get("sheets", []))
    write_csv(out_dir / "pit_daily_rollups.csv", h, r)

    write_readme(out_dir, generated_at)

    meta = {
        "generated_at": generated_at,
        "output_dir": str(out_dir),
        "files": [
            "sheet_index.csv",
            "loads_mine_total_daily.csv",
            "loads_emalahleni_by_asset.csv",
            "machine_hours_snapshots.csv",
            "machine_hours_daily_derived.csv",
            "pit_daily_rollups.csv",
            "README.md",
        ],
    }
    with open(out_dir / "intuitive_manifest.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
