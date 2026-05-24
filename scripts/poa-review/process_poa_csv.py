#!/usr/bin/env python3
"""Run POA Review pipeline on a CSV file and write formatted Excel output."""
import gc
import json
import os
import sys

import pandas as pd

from ProofReview import POAReview, format_review

MAX_ROWS_DEFAULT = 500000
# OpenAI batch scoring does not scale to 70k+ row workbooks (thousands of labels × API latency).
LARGE_FILE_LLM_MAX_ROWS = 15000


def normalize_column_name(col_name):
    if pd.isna(col_name):
        return None
    return str(col_name).strip().lower()


def find_column(df, target_name):
    normalized_target = normalize_column_name(target_name)
    for col in df.columns:
        if normalize_column_name(col) == normalized_target:
            return col
    return None


SKIP_CATEGORY_COLS = frozenset({
    'Transaction ID', 'Asset Number', 'Date & Time', 'Source', 'Activity',
    'Asset Description', 'Comments', 'Operation Description / Comment',
})


def drop_empty_rows(data: pd.DataFrame) -> pd.DataFrame:
    """Match browser pre-flight: drop rows where every cell is blank."""
    if data.empty:
        return data

    def row_has_value(row: pd.Series) -> bool:
        for v in row:
            if pd.isna(v):
                continue
            if str(v).strip():
                return True
        return False

    keep = data.apply(row_has_value, axis=1)
    dropped = int((~keep).sum())
    if dropped:
        print(f'Filtered {dropped} completely empty rows', flush=True)
    return data.loc[keep].reset_index(drop=True)


def prepare_dataframe(data: pd.DataFrame) -> pd.DataFrame:
    required_columns = {
        'Transaction ID': ['transaction id', 'transactionid', 'txn id', 'txnid'],
        'Asset Number': ['asset number', 'assetnumber', 'asset no', 'assetno'],
        'Date & Time': ['date & time', 'date and time', 'datetime', 'date', 'timestamp'],
    }

    column_mapping = {}
    missing_columns = []

    for expected_col, possible_names in required_columns.items():
        found_col = None
        if expected_col in data.columns:
            found_col = expected_col
        else:
            for possible_name in possible_names:
                found_col = find_column(data, possible_name)
                if found_col:
                    break
        if found_col:
            if found_col != expected_col:
                column_mapping[found_col] = expected_col
        else:
            missing_columns.append(expected_col)

    if missing_columns:
        available_cols = ', '.join([f"'{col}'" for col in data.columns])
        raise ValueError(
            f"Missing required columns: {', '.join(missing_columns)}.\n"
            f"Available columns in your file: {available_cols}"
        )

    if column_mapping:
        data = data.rename(columns=column_mapping)

    numeric_cols = [
        'Litres', 'Opening SMR', 'Closing SMR', 'Total Fuel Used (L)',
        'Eligible Volume (L) (Claimable % of Total)', 'Eligible Price', 'Eligible Total (R)',
        'Total Usage Km/Hr', 'Loads / Tonnes', 'Pump Before', 'Pump After', 'Opening Odo', 'Closing Odo',
        '≈ Tank Litres Before', '≈ Tank Litres After', 'Total SMR Usage',
    ]
    for col in numeric_cols:
        if col in data.columns:
            try:
                data[col] = pd.to_numeric(data[col], errors='coerce').astype('float32')
            except Exception:
                pass

    # Category conversion saves memory on large files but nunique() per column is costly.
    use_categories = len(data) <= 25000
    if use_categories:
        for col in data.columns:
            if col in SKIP_CATEGORY_COLS:
                continue
            if data[col].dtype == object or data[col].dtype.name == 'string':
                try:
                    if data[col].nunique() < len(data) * 0.5:
                        data[col] = data[col].astype('category')
                except Exception:
                    pass

    for col in data.select_dtypes(include=['floating']).columns:
        try:
            data[col] = data[col].astype('float32')
        except Exception:
            pass

    return data


def run_pipeline(
    input_file: str,
    output_file: str,
    sources: list,
    use_llm_strength: bool = False,
    cache_dir: str | None = None,
    max_rows: int = MAX_ROWS_DEFAULT,
) -> None:
    print('Reading CSV file...', flush=True)
    data = pd.read_csv(input_file, skiprows=0, low_memory=True)
    print(f'Read {len(data)} rows, {len(data.columns)} columns', flush=True)

    if len(data) > max_rows:
        raise ValueError(
            f'This file has too many rows ({len(data)}). '
            f'Maximum {max_rows} rows are supported. Please split your file.'
        )

    data = drop_empty_rows(data)
    print(f'After empty-row filter: {len(data)} rows', flush=True)

    # Drop prior computed columns if re-processing an already-reviewed export
    for col in (
        'No POA Asset', 'Count of proof before transaction', 'Time since last activity',
        'total smr', 'POA Strength', 'POA Compliance Points', 'POA Shortfalls', 'label', 'is consec',
    ):
        if col in data.columns:
            data = data.drop(columns=[col])

    data = prepare_dataframe(data)
    original_columns = list(data.columns)
    print('Prepared dataframe', flush=True)

    if use_llm_strength and len(data) > LARGE_FILE_LLM_MAX_ROWS:
        print(
            f'AI strength disabled for large files ({len(data)} rows > {LARGE_FILE_LLM_MAX_ROWS}). '
            'Using rules-only (fast). Split by month for AI on smaller extracts.',
            flush=True,
        )
        use_llm_strength = False

    review = POAReview(data)
    print('POAReview initialized', flush=True)
    review.mark_consecutive_transactions()
    review.label_rows()
    review.mark_no_poa_assets()
    review.count_proof_before_transaction()
    review.time_since_last_activity()
    if 'label' not in review.data.columns:
        review.label_rows()
    print('Core POA metrics computed', flush=True)
    review.total_smr(sources)
    print('Total SMR computed', flush=True)
    gc.collect()
    review.evaluate_poa_strength(use_llm=use_llm_strength, cache_dir=cache_dir)
    print('POA strength evaluated', flush=True)
    gc.collect()

    os.makedirs(os.path.dirname(output_file) or '.', exist_ok=True)
    print('Writing Excel output...', flush=True)
    format_review(
        review.data,
        os.path.basename(input_file),
        output_file,
        original_columns,
    )

    if not os.path.exists(output_file):
        raise RuntimeError(f'Output file was not created at {output_file}')
    print(f'Success! Output saved to: {output_file}', flush=True)


def main() -> int:
    if len(sys.argv) < 3:
        print(
            'Usage: process_poa_csv.py <input.csv> <output.xlsx> [sources_json] [use_llm] [cache_dir] [max_rows]',
            file=sys.stderr,
        )
        return 1

    input_file = sys.argv[1]
    output_file = sys.argv[2]
    sources = json.loads(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3] else ['Inmine: Daily Diesel Issues']
    use_llm = sys.argv[4].lower() in ('1', 'true', 'yes') if len(sys.argv) > 4 else False
    cache_dir = sys.argv[5] if len(sys.argv) > 5 else None
    max_rows = int(sys.argv[6]) if len(sys.argv) > 6 else MAX_ROWS_DEFAULT

    try:
        run_pipeline(input_file, output_file, sources, use_llm, cache_dir, max_rows)
        return 0
    except Exception as exc:
        print(f'Error: {exc}', file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
