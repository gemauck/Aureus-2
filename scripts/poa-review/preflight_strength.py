"""
Run POA strength evaluation on in-memory rows (pre-flight / UI parity with server report).
Reads JSON from stdin: { rows, sources, settings, columnMapping }.
Writes JSON summary to stdout.
"""
from __future__ import annotations

import json
import sys

import numpy as np
import pandas as pd

from poaStrengthEvaluator import (
    evaluate_all_labels,
    get_rules_meta,
    load_rules,
    normalize_poa_settings,
    summarize_strength_results,
)


def _norm_col(name) -> str:
    if name is None:
        return ""
    return str(name).strip().lower()


def _apply_column_mapping(df: pd.DataFrame, mapping: dict) -> pd.DataFrame:
    if not mapping:
        return df
    rename = {}
    for raw, target in mapping.items():
        if not target or not raw:
            continue
        for col in df.columns:
            if _norm_col(col) == _norm_col(raw) or col == raw:
                rename[col] = target
                break
    if rename:
        return df.rename(columns=rename)
    return df


def _label_rows_like_review(data: pd.DataFrame, txn_mask: pd.Series, proof_mask: pd.Series, window_h: float):
    window_h = float(window_h or 1)
    data = data.copy()
    time_between = data.loc[txn_mask, "Date & Time"].diff()
    data.loc[txn_mask, "is consec"] = np.where(
        (time_between > pd.Timedelta(hours=0))
        & (time_between < pd.Timedelta(hours=window_h)),
        0,
        1,
    ).astype(np.int8)
    data.loc[txn_mask, "label"] = (
        data.loc[txn_mask, "Asset Number"].astype(str)
        + "-"
        + data.loc[txn_mask, "is consec"].cumsum().astype(int).astype(str)
    )
    data.loc[txn_mask | proof_mask, "label"] = (
        data.loc[txn_mask | proof_mask, :].groupby("Asset Number")["label"].bfill()
    )
    return data


def run_preflight(payload: dict) -> dict:
    rows = payload.get("rows") or []
    if not rows:
        return {"strengthSummary": None, "rulesMeta": get_rules_meta(), "error": "No rows"}

    settings = normalize_poa_settings(payload.get("settings"))
    sources = payload.get("sources") or []
    mapping = payload.get("columnMapping") or {}

    df = pd.DataFrame(rows)
    df = _apply_column_mapping(df, mapping)

    for col in ("Date & Time",):
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")

    txn_id_str = df["Transaction ID"].astype(str).str.strip() if "Transaction ID" in df.columns else pd.Series([""] * len(df))
    txn_mask = (
        df["Transaction ID"].notna()
        & (txn_id_str != "")
        & (txn_id_str != "Transaction ID")
    ) if "Transaction ID" in df.columns else pd.Series([False] * len(df))
    proof_mask = (~txn_mask) & df["Asset Number"].notna() if "Asset Number" in df.columns else pd.Series([False] * len(df))

    if not txn_mask.any():
        return {
            "strengthSummary": None,
            "rulesMeta": get_rules_meta(),
            "error": "No transaction rows",
        }

    df = _label_rows_like_review(df, txn_mask, proof_mask, settings.get("batchWindowHours", 1))
    label_results = evaluate_all_labels(df, proof_mask, txn_mask, settings=settings)
    summary = summarize_strength_results(label_results)
    shift_count = sum(1 for r in label_results.values() if r.get("shiftProofApplied"))

    return {
        "strengthSummary": summary,
        "rulesMeta": get_rules_meta(),
        "shiftFallbackBatchCount": shift_count,
        "preflightEngine": "python",
    }


def main():
    payload = json.load(sys.stdin)
    out = run_preflight(payload)
    json.dump(out, sys.stdout)


if __name__ == "__main__":
    main()
