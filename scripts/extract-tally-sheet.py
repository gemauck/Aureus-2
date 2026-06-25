#!/usr/bin/env python3
"""Extract loader/truck hourly tallies from Ritluka tally sheet workbook."""

import argparse
import re
from pathlib import Path

import pandas as pd

DEFAULT_INPUT = Path("/Users/gemau/Downloads/Copy of May  tally sheet (1).xlsx")
DEFAULT_OUTPUT = (
    Path(__file__).resolve().parent.parent / "reports" / "may-tally-extract.xlsx"
)

INPUT_FILE = DEFAULT_INPUT
OUTPUT_FILE = DEFAULT_OUTPUT

SHEET_NAME = re.compile(
    r"^(\d{1,2})\s+(Apr(?:il)?|May)(?:\s+(\d{4}))?\s+(Day|Night|day|night|NIght|Nght)$",
    re.I,
)
TIME_RANGE = re.compile(r"(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})")
HR_NUMBER = re.compile(r"^HR\s*(\d+)", re.I)

COL_LOADER = 0
COL_MATERIAL = 1
COL_SOURCE = 2
COL_DEST = 3
COL_TRUCK = 4
COL_APPLICABLE_TONS = 5
COL_DISTANCE = 6
HEADER_ROW = 4
DATA_START_ROW = 5

MONTH_MAP = {
    "apr": 4,
    "april": 4,
    "may": 5,
}

MONTH_NAME = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}


def normalize_date(val, sheet_name: str | None = None) -> str | None:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return date_from_sheet_name(sheet_name) if sheet_name else None
    if isinstance(val, pd.Timestamp):
        return val.strftime("%Y-%m-%d")
    s = str(val).strip()
    if not s or s.lower() == "nan":
        return date_from_sheet_name(sheet_name) if sheet_name else None
    if re.match(r"^\d{4}-\d{2}-\d{2}", s):
        return s[:10]
    m = re.match(r"^0*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$", s)
    if m:
        day = int(m.group(1))
        month = MONTH_NAME.get(m.group(2).lower()[:3])
        year = int(m.group(3))
        if month:
            return f"{year}-{month:02d}-{day:02d}"
    fallback = date_from_sheet_name(sheet_name) if sheet_name else None
    return fallback or s[:10]


def clean_str(val) -> str | None:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    s = str(val).strip()
    return s if s and s.lower() != "nan" else None


def clean_number(val) -> float | None:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def parse_hour_label(label: str) -> tuple[int | None, str | None, str | None]:
    """Return (hr_number, hour_start, hour_end) from header like 'HR 1 (07:00 - 08:00)'."""
    label = re.sub(r"\s+", " ", label.replace("\n", " ").strip())
    hm = HR_NUMBER.match(label)
    hr_num = int(hm.group(1)) if hm else None
    tm = TIME_RANGE.search(label)
    if tm:
        return hr_num, tm.group(1), tm.group(2)
    return hr_num, None, None


def parse_sheet_meta(df: pd.DataFrame, sheet_name: str) -> dict:
    meta: dict = {}
    for i in range(min(4, len(df))):
        for j in range(df.shape[1] - 1):
            label = clean_str(df.iloc[i, j])
            if not label:
                continue
            key = label.upper().replace("  ", " ")
            val = df.iloc[i, j + 1]
            if key == "DATE" and pd.notna(val):
                meta["date"] = normalize_date(val, sheet_name)
            elif key == "SHIFT" and pd.notna(val):
                meta["shift"] = clean_str(val)
            elif key == "DAY/NIGHT" and pd.notna(val):
                meta["day_night"] = clean_str(val)
    if "date" not in meta:
        meta["date"] = date_from_sheet_name(sheet_name)
    return meta


def date_from_sheet_name(name: str) -> str | None:
    m = SHEET_NAME.match(name.strip())
    if not m:
        return None
    day = int(m.group(1))
    month = MONTH_MAP.get(m.group(2).lower(), 4)
    year = int(m.group(3)) if m.group(3) else 2026
    # April has 30 days; "31 Apr Night" in workbook is the night after 30 Apr
    if month == 4 and day > 30:
        day = 30
    return f"{year}-{month:02d}-{day:02d}"


def day_night_from_sheet_name(name: str) -> str | None:
    m = SHEET_NAME.match(name.strip())
    return m.group(4).capitalize() if m else None


def is_loader_subtotal_row(row: pd.Series, has_truck: bool) -> bool:
    """Subtotal row: no truck, but numeric hourly totals."""
    if has_truck:
        return False
    for col in range(7, 31):
        if clean_number(row.iloc[col]) not in (None, 0):
            return True
    return False


def parse_sheet(sheet_name: str, df: pd.DataFrame) -> list[dict]:
    if sheet_name.lower() == "droplist":
        return []

    meta = parse_sheet_meta(df, sheet_name)
    date = meta.get("date") or date_from_sheet_name(sheet_name)
    shift = meta.get("shift")
    day_night = meta.get("day_night") or day_night_from_sheet_name(sheet_name)

    if len(df) <= HEADER_ROW:
        return []

    header = df.iloc[HEADER_ROW]
    hour_cols: list[dict] = []
    for i in range(len(header)):
        label = clean_str(header.iloc[i])
        if not label or not label.upper().startswith("HR "):
            continue
        hr_num, start, end = parse_hour_label(label)
        tons_col = i + 1 if i + 1 < len(header) else None
        hour_cols.append(
            {
                "loads_col": i,
                "tons_col": tons_col,
                "hour_label": label,
                "hour_number": hr_num,
                "hour_start": start,
                "hour_end": end,
            }
        )

    rows: list[dict] = []
    loader = material = source = dest = distance = None

    for r in range(DATA_START_ROW, len(df)):
        line = df.iloc[r]
        loader_val = clean_str(line.iloc[COL_LOADER])
        if loader_val:
            loader = loader_val
            material = clean_str(line.iloc[COL_MATERIAL])
            source = clean_str(line.iloc[COL_SOURCE])
            dest = clean_str(line.iloc[COL_DEST])
            distance = clean_str(line.iloc[COL_DISTANCE])

        truck = clean_str(line.iloc[COL_TRUCK])
        applicable_tons = clean_number(line.iloc[COL_APPLICABLE_TONS])

        if not loader:
            continue
        if is_loader_subtotal_row(line, bool(truck)):
            continue
        if not truck:
            continue

        for hc in hour_cols:
            loads = clean_number(line.iloc[hc["loads_col"]])
            tons = (
                clean_number(line.iloc[hc["tons_col"]])
                if hc["tons_col"] is not None
                else None
            )
            if (loads or 0) == 0 and (tons or 0) == 0:
                continue
            rows.append(
                {
                    "Date": date,
                    "Shift": shift,
                    "Day_Night": day_night,
                    "Hour": hc["hour_start"],
                    "Hour_End": hc["hour_end"],
                    "Hour_Number": hc["hour_number"],
                    "Hour_Label": hc["hour_label"],
                    "Loader": loader,
                    "Material": material,
                    "Source": source,
                    "Destination": dest,
                    "Trucks": truck,
                    "Loads": loads,
                    "Tonnes": tons,
                    "Applicable_Tons": applicable_tons,
                    "Distance": distance or clean_str(line.iloc[COL_DISTANCE]),
                    "Sheet": sheet_name,
                }
            )

    return rows


def main(input_file: Path = INPUT_FILE, output_file: Path = OUTPUT_FILE):
    xls = pd.ExcelFile(input_file)
    all_rows: list[dict] = []
    sheet_stats: list[dict] = []

    for sheet_name in xls.sheet_names:
        df = pd.read_excel(xls, sheet_name=sheet_name, header=None)
        parsed = parse_sheet(sheet_name, df)
        all_rows.extend(parsed)
        sheet_stats.append(
            {
                "Sheet": sheet_name,
                "Rows_Extracted": len(parsed),
                "Date": parsed[0]["Date"] if parsed else None,
                "Shift": parsed[0]["Shift"] if parsed else None,
                "Day_Night": parsed[0]["Day_Night"] if parsed else None,
            }
        )

    df_detail = pd.DataFrame(all_rows)
    df_sheets = pd.DataFrame(sheet_stats)

    if not df_detail.empty:
        df_detail = df_detail.sort_values(
            ["Date", "Day_Night", "Shift", "Hour_Number", "Loader", "Trucks"],
            na_position="last",
            kind="mergesort",
        )
        # Shift-level loader summary (unique loaders per day/shift)
        df_loaders = (
            df_detail.groupby(
                ["Date", "Shift", "Day_Night", "Loader", "Material", "Source", "Destination"],
                dropna=False,
            )
            .agg(
                Total_Loads=("Loads", "sum"),
                Total_Tonnes=("Tonnes", "sum"),
                Trucks_Used=("Trucks", "nunique"),
            )
            .reset_index()
        )
    else:
        df_loaders = pd.DataFrame()

    detail_cols = [
        "Date",
        "Shift",
        "Day_Night",
        "Hour",
        "Loader",
        "Material",
        "Source",
        "Destination",
        "Trucks",
        "Loads",
        "Tonnes",
        "Distance",
        "Hour_End",
        "Hour_Number",
        "Applicable_Tons",
        "Hour_Label",
        "Sheet",
    ]

    output_file.parent.mkdir(parents=True, exist_ok=True)
    with pd.ExcelWriter(output_file, engine="openpyxl") as writer:
        if not df_detail.empty:
            df_detail.reindex(columns=[c for c in detail_cols if c in df_detail.columns]).to_excel(
                writer, sheet_name="Tally_Detail", index=False
            )
            df_loaders.to_excel(writer, sheet_name="Loaders_Per_Shift", index=False)
        df_sheets.to_excel(writer, sheet_name="Sheet_Index", index=False)

    print(f"Sheets processed: {len(xls.sheet_names) - 1}")  # minus Droplist
    print(f"Detail rows (truck-hour with activity): {len(df_detail):,}")
    if not df_detail.empty:
        print(f"Date range: {df_detail['Date'].min()} -> {df_detail['Date'].max()}")
        print(f"Unique loaders: {df_detail['Loader'].nunique()}")
    print(f"Written: {output_file}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract Ritluka tally sheet to long-format Excel")
    parser.add_argument("input", nargs="?", default=str(DEFAULT_INPUT), help="Input tally .xlsx")
    parser.add_argument("output", nargs="?", default=str(DEFAULT_OUTPUT), help="Output .xlsx")
    args = parser.parse_args()
    main(Path(args.input), Path(args.output))
