"""
POA Review - standalone script for Pyodide (browser).
Reads /tmp/input.csv, options from /tmp/options.json, writes /tmp/output.xlsx.
No server; runs entirely in the browser. Uses openpyxl write_only only (no FormatExcel).
"""
import json
import pandas as pd
import numpy as np

INPUT_CSV = "/tmp/input.csv"
OPTIONS_JSON = "/tmp/options.json"
OUTPUT_XLSX = "/tmp/output.xlsx"

REVIEW_COLS = [
    "Date & Time", "Transaction ID", "Asset Description", "Asset Number", "Asset Group",
    "Asset Tank Size (L)", "Asset Meter Type (Hr/Km)", "Storage Tank", "Fuel Pump", "Litres",
    "Total Fuel Used (L)", "Operation Description / Comment", "Refund Eligibility", "Opening SMR",
    "Closing SMR", "Total SMR Usage", "Material", "Location.1", "Loads / Tonnes", "Activity",
    "Comments", "Source", "Custom Attribute", "No POA Asset", "Count of proof before transaction",
    "Time since last activity", "total smr"
]


def normalize_column_name(col_name):
    if pd.isna(col_name):
        return None
    return str(col_name).strip().lower()


def find_column(df, target_name):
    n = normalize_column_name(target_name)
    for col in df.columns:
        if normalize_column_name(col) == n:
            return col
    return None


def _write_only_excel(review, output_path, review_cols, bold_rows, green_rows, yellow_col16):
    from openpyxl import Workbook
    from openpyxl.cell import WriteOnlyCell
    from openpyxl.styles import PatternFill, Font, Alignment, Color
    fill_header = PatternFill(patternType="solid", fgColor=Color(rgb="CCDAF5"))
    fill_green = PatternFill(patternType="solid", fgColor=Color(rgb="D9EAD3"))
    fill_yellow = PatternFill(patternType="solid", fgColor=Color(rgb="FFF2CC"))
    font_9 = Font(size=9)
    font_9_bold = Font(size=9, bold=True)
    align_left = Alignment(horizontal="left")
    num_cols = len(review_cols)
    wb = Workbook(write_only=True)
    ws = wb.create_sheet(title="Details as Assets")
    header_cells = []
    for col in review_cols:
        c = WriteOnlyCell(ws, value=col)
        c.fill = fill_header
        c.font = font_9_bold
        c.alignment = align_left
        header_cells.append(c)
    ws.append(header_cells)
    data_arr = review[review_cols].values
    bold_arr = bold_rows.values
    green_arr = green_rows.values
    yellow_arr = yellow_col16.values
    for i in range(len(review)):
        row_vals = data_arr[i]
        row_cells = []
        for j in range(num_cols):
            val = row_vals[j]
            if pd.isna(val):
                val = None
            c = WriteOnlyCell(ws, value=val)
            c.font = font_9_bold if bold_arr[i] else font_9
            c.alignment = align_left
            if green_arr[i]:
                c.fill = fill_green
            if j == 15 and yellow_arr[i]:
                c.fill = fill_yellow
            row_cells.append(c)
        ws.append(row_cells)
    wb.save(output_path)


class POAReview:
    def __init__(self, per_asset_report):
        self.data = per_asset_report
        self.transaction_mask = (
            self.data["Transaction ID"].notna()
            & (self.data["Transaction ID"].astype(str).str.strip() != "Transaction ID")
        )
        self.proof_mask = (
            self.data["Transaction ID"].isna() & self.data["Asset Number"].notna()
        )
        self.data["Date & Time"] = pd.to_datetime(
            self.data["Date & Time"], yearfirst=True, errors="coerce"
        )
        for col in ("Asset Number", "Transaction ID", "Source"):
            if col in self.data.columns and self.data[col].dtype == object:
                self.data[col] = self.data[col].astype("category")

    def mark_consecutive_transactions(self):
        time_between = self.data.loc[self.transaction_mask, "Date & Time"].diff()
        self.data.loc[self.transaction_mask, "is consec"] = np.where(
            (time_between > pd.Timedelta(hours=0))
            & (time_between < pd.Timedelta(hours=1)),
            0,
            1,
        ).astype(np.int8)
        return self.data

    def label_rows(self):
        if "is consec" not in self.data.columns:
            self.mark_consecutive_transactions()
        self.data.loc[self.transaction_mask, "label"] = (
            self.data.loc[self.transaction_mask, "Asset Number"].astype(str)
            + "-"
            + self.data.loc[self.transaction_mask, "is consec"].cumsum().astype(int).astype(str)
        )
        self.data.loc[self.transaction_mask | self.proof_mask, "label"] = (
            self.data.loc[self.transaction_mask | self.proof_mask, :]
            .groupby("Asset Number")["label"]
            .bfill()
        )
        self.data["label"] = self.data["label"].astype("category")
        self.data.drop(columns=["is consec"], inplace=True, errors="ignore")
        return self.data

    def mark_no_poa_assets(self):
        poa_assets = set(
            self.data.loc[self.proof_mask, "Asset Number"].dropna().unique()
        )
        self.data.loc[
            (~self.data["Asset Number"].isin(poa_assets))
            & (self.data["Asset Number"].notna())
            & (self.data["Asset Number"].astype(str).str.strip() != "Asset Number"),
            "No POA Asset",
        ] = "No Proof of Use Asset"
        return self.data

    def count_proof_before_transaction(self):
        if "label" not in self.data.columns:
            self.label_rows()
        count = self.data.loc[self.proof_mask, "label"].value_counts().to_dict()
        mapped = self.data.loc[self.transaction_mask, "label"].map(count)
        self.data.loc[
            self.transaction_mask, "Count of proof before transaction"
        ] = pd.to_numeric(mapped, errors="coerce").fillna(0).astype(np.int32)
        return self.data

    def time_since_last_activity(self):
        if "Count of proof before transaction" not in self.data.columns:
            self.count_proof_before_transaction()
        mask = self.transaction_mask | self.proof_mask
        self.data.loc[mask, "Last Empty Time"] = self.data.loc[
            mask, "Date & Time"
        ].where(self.data.loc[mask, "Transaction ID"].isna())
        self.data.loc[mask, "Last Empty Time"] = (
            self.data.loc[mask, :].groupby("Asset Number")["Last Empty Time"].ffill()
        )
        delta = (
            self.data.loc[mask, "Date & Time"]
            - self.data.loc[mask, "Last Empty Time"]
        )
        self.data.loc[mask, "Time since last activity"] = (
            delta.dt.total_seconds() / 3600.0
        ).astype(np.float32)
        self.data.drop(columns=["Last Empty Time"], inplace=True, errors="ignore")
        return self.data

    def total_smr(self, sources):
        source_mask = self.data["Source"].isin(sources)
        smr_numeric = pd.to_numeric(
            self.data.loc[source_mask, "Total SMR Usage"], errors="coerce"
        ).fillna(0).astype(np.float32)
        hours = (
            self.data.loc[source_mask]
            .assign(_s=smr_numeric)
            .groupby("label", observed=True)["_s"]
            .sum()
            .to_dict()
        )
        mapped = self.data.loc[self.transaction_mask, "label"].map(hours)
        self.data["total smr"] = np.nan
        self.data.loc[self.transaction_mask, "total smr"] = (
            pd.to_numeric(mapped, errors="coerce").fillna(0).astype(np.float32)
        )
        return self.data


def run():
    with open(OPTIONS_JSON, "r") as f:
        options = json.load(f)
    sources = options.get("sources", ["Inmine: Daily Diesel Issues"])

    data = pd.read_csv(INPUT_CSV, low_memory=True)
    required = {
        "Transaction ID": ["transaction id", "transactionid", "txn id", "txnid"],
        "Asset Number": ["asset number", "assetnumber", "asset no", "assetno"],
        "Date & Time": ["date & time", "date and time", "datetime", "date", "timestamp"],
    }
    column_mapping = {}
    for expected_col, possible_names in required.items():
        found = expected_col if expected_col in data.columns else None
        if not found:
            for name in possible_names:
                found = find_column(data, name)
                if found:
                    break
        if found and found != expected_col:
            column_mapping[found] = expected_col
        if not found:
            raise ValueError(f"Missing required column: {expected_col}")
    if column_mapping:
        data = data.rename(columns=column_mapping)

    if "Source" not in data.columns and sources:
        data["Source"] = sources[0]
    data = data[[c for c in data.columns if c in REVIEW_COLS]]
    review = POAReview(data)
    review.mark_consecutive_transactions()
    review.label_rows()
    review.mark_no_poa_assets()
    review.count_proof_before_transaction()
    review.time_since_last_activity()
    review.total_smr(sources)

    drop_cols = [c for c in review.data.columns if c not in REVIEW_COLS]
    if drop_cols:
        review.data.drop(columns=drop_cols, inplace=True)
    for c in REVIEW_COLS:
        if c not in review.data.columns:
            review.data[c] = np.nan
    review.data = review.data.reindex(columns=REVIEW_COLS)

    col_dt = review.data["Date & Time"]
    col_txn = review.data["Transaction ID"]
    col_smr = review.data["Total SMR Usage"]
    smr_numeric = pd.to_numeric(col_smr, errors="coerce").fillna(0)
    is_ts = (
        col_dt.notna()
        if pd.api.types.is_datetime64_any_dtype(col_dt)
        else pd.Series([isinstance(x, pd.Timestamp) for x in col_dt], index=review.data.index)
    )
    has_txn = col_txn.notna() & (col_txn.astype(str).str.strip() != "")
    smr_empty = col_smr.isna() | (smr_numeric == 0)
    bold_rows = ~is_ts & col_dt.notna()
    green_rows = has_txn & is_ts
    yellow_col16 = is_ts & ((smr_empty & ~has_txn) | (smr_numeric == 0))

    _write_only_excel(
        review.data, OUTPUT_XLSX, REVIEW_COLS, bold_rows, green_rows, yellow_col16
    )


if __name__ == "__main__":
    run()
