# Parse InsightWare / Abcotronics "Transaction Exceptions - In Context" workbooks.
"""Multi-sheet parser for dispense exception audit workbooks."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any

import pandas as pd

REQUIRED_SHEETS = ['Details as Assets']
OPTIONAL_SHEETS = [
    'Transactions deemed ineligible',
    'Possible Cause Summary',
    'Summary Per Asset',
    '60 min Lookup',
    '180 Day Lookup',
    'Department Lookup',
]

DETAIL_COLUMNS = [
    'date_time',
    'transaction_id',
    'asset_description',
    'asset_number',
    'asset_group',
    'tank_size_l',
    'meter_type',
    'storage_tank',
    'fuel_pump',
    'litres',
    'opening_odo',
    'closing_odo',
    'total_usage',
    'exception_120',
    'exception_60',
    'abco_comment',
    'operation_comment',
    'refund_eligibility',
    'avg_economy_180d',
    'economy',
    'pct_variance',
    'economy_type',
    'department',
]

HEADER_ALIASES = {
    'date_time': ['date & time', 'date and time', 'datetime'],
    'transaction_id': ['transaction id', 'transactionid'],
    'asset_description': ['asset description'],
    'asset_number': ['asset number', 'assetnumber'],
    'asset_group': ['asset group'],
    'tank_size_l': ['asset tank size (l)', 'tank size'],
    'meter_type': ['asset meter type (hr/km)', 'odometer type'],
    'storage_tank': ['storage tank'],
    'fuel_pump': ['fuel pump'],
    'litres': ['litres', 'liters'],
    'opening_odo': ['opening odo', 'opening smr'],
    'closing_odo': ['closing odo', 'closing smr'],
    'total_usage': ['total usage km/hr', 'total smr usage', 'total usage'],
    'exception_120': ['exception reason (120 min)'],
    'exception_60': ['exception reason (60 min)'],
    'abco_comment': ['abco comment'],
    'operation_comment': ['operation description / comment'],
    'refund_eligibility': ['refund eligibility'],
    'avg_economy_180d': ['average economy (180 days)', 'average economy'],
    'economy': ['economy'],
    'pct_variance': ['% varinace', '% variance'],
    'economy_type': ['economy type'],
    'department': ['department'],
}


def normalize_header(value: Any) -> str | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    text = str(value).strip().lower()
    return text or None


def map_header_row(values: list[Any]) -> dict[int, str]:
    mapping: dict[int, str] = {}
    normalized = [normalize_header(v) for v in values]
    for idx, header in enumerate(normalized):
        if not header:
            continue
        for key, aliases in HEADER_ALIASES.items():
            if header in aliases or header == key.replace('_', ' '):
                mapping[idx] = key
                break
    return mapping


def parse_odo(value: Any) -> float | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().lower()
    text = re.sub(r'\s*(hr|km|l/hr|km/l)\s*$', '', text)
    try:
        return float(text)
    except ValueError:
        return None


def parse_datetime(value: Any) -> datetime | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, datetime):
        return value
    text = str(value).strip()
    for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M', '%d/%m/%Y %H:%M:%S', '%d/%m/%Y %H:%M'):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    try:
        return pd.to_datetime(text).to_pydatetime()
    except Exception:
        return None


def is_asset_header_row(row_values: list[Any]) -> bool:
    if not row_values:
        return False
    first = row_values[0]
    second = row_values[1] if len(row_values) > 1 else None
    if first is None or second is not None:
        return False
    text = str(first).strip()
    if not text or text in ('Date & Time', 'Totals:', ' '):
        return False
    if 'transaction' in text.lower():
        return False
    try:
        parse_datetime(text)
        return False
    except Exception:
        pass
    try:
        float(text)
        return False
    except ValueError:
        return len(text) <= 20


def is_column_header_row(row_values: list[Any]) -> bool:
    joined = ' '.join(str(v or '').lower() for v in row_values[:5])
    return 'transaction id' in joined and 'date' in joined


def is_transaction_row(row_values: list[Any]) -> bool:
    if len(row_values) < 2:
        return False
    txn_id = row_values[1]
    if txn_id is None or (isinstance(txn_id, float) and pd.isna(txn_id)):
        return False
    text = str(txn_id).strip()
    if not text or text.lower() in ('transaction id', 'total litres'):
        return False
    if text.lower().startswith('uploaded '):
        return False
    return True


def row_to_record(row_values: list[Any], col_map: dict[int, str], asset_number: str | None) -> dict[str, Any]:
    record: dict[str, Any] = {key: None for key in DETAIL_COLUMNS}
    for idx, key in col_map.items():
        if idx < len(row_values):
            record[key] = row_values[idx]
    record['asset_number'] = record.get('asset_number') or asset_number
    record['date_time'] = parse_datetime(record.get('date_time'))
    record['opening_odo_num'] = parse_odo(record.get('opening_odo'))
    record['closing_odo_num'] = parse_odo(record.get('closing_odo'))
    record['total_usage_num'] = parse_odo(record.get('total_usage'))
    if record.get('litres') is not None:
        try:
            record['litres'] = float(record['litres'])
        except (TypeError, ValueError):
            pass
    if record.get('tank_size_l') is not None:
        try:
            record['tank_size_l'] = float(record['tank_size_l'])
        except (TypeError, ValueError):
            pass
    if record.get('pct_variance') is not None:
        try:
            record['pct_variance'] = float(record['pct_variance'])
        except (TypeError, ValueError):
            pass
    for field in ('exception_120', 'exception_60', 'abco_comment', 'refund_eligibility'):
        val = record.get(field)
        if val is not None and not (isinstance(val, float) and pd.isna(val)):
            record[field] = str(val).strip()
        else:
            record[field] = None
    return record


def parse_details_sheet(df: pd.DataFrame) -> list[dict[str, Any]]:
    transactions: list[dict[str, Any]] = []
    current_asset: str | None = None
    col_map: dict[int, str] = {}
    global_col_map: dict[int, str] = {}

    for _, row in df.iterrows():
        values = row.tolist()
        if is_column_header_row(values):
            mapped = map_header_row(values)
            if 'exception_60' in mapped.values() or 'exception_120' in mapped.values():
                global_col_map = mapped
            # Section headers often omit exception columns; keep full map when partial.
            if 'exception_60' not in mapped.values() and global_col_map:
                col_map = dict(global_col_map)
            else:
                col_map = mapped
            continue
        if is_asset_header_row(values):
            current_asset = str(values[0]).strip()
            if global_col_map:
                col_map = dict(global_col_map)
            continue
        if not is_transaction_row(values):
            continue
        if not col_map:
            continue
        record = row_to_record(values, col_map, current_asset)
        if record.get('transaction_id'):
            transactions.append(record)
    return transactions


def parse_flat_sheet(path: str, sheet_name: str) -> pd.DataFrame:
    return pd.read_excel(path, sheet_name=sheet_name, header=0)


def parse_review_queue_simple(path: str) -> list[dict[str, Any]]:
    df = pd.read_excel(path, sheet_name='Transactions deemed ineligible', header=0)
    records = []
    for _, row in df.iterrows():
        txn = row.get('Transaction ID')
        if pd.isna(txn) or str(txn).strip().lower() in ('transaction id', 'total litres', ''):
            continue
        if str(txn).lower().startswith('uploaded '):
            continue
        rec = {
            'transaction_id': str(txn).strip(),
            'date_time': parse_datetime(row.get('Date & Time')),
            'asset_number': row.get('Asset Number'),
            'litres': float(row['Litres']) if pd.notna(row.get('Litres')) else None,
            'exception_120': row.get('Exception Reason (120 min)'),
            'exception_60': row.get('Exception Reason (60 min)'),
            'abco_comment': row.get('Abco Comment'),
            'refund_eligibility': row.get('Refund Eligibility'),
        }
        records.append(rec)
    return records


def parse_possible_cause_summary(path: str) -> list[dict[str, Any]]:
    df = pd.read_excel(path, sheet_name='Possible Cause Summary', header=None)
    rows = []
    for _, row in df.iterrows():
        reason = row.iloc[0] if len(row) > 0 else None
        cause = row.iloc[1] if len(row) > 1 else None
        count = row.iloc[2] if len(row) > 2 else None
        litres = row.iloc[3] if len(row) > 3 else None
        if pd.isna(reason) or str(reason).strip() in ('Exception Reason', 'Total'):
            continue
        if pd.isna(cause):
            continue
        rows.append({
            'exception_reason': str(reason).strip(),
            'possible_cause': str(cause).strip(),
            'transaction_count': int(float(count)) if pd.notna(count) else None,
            'litres': float(litres) if pd.notna(litres) else None,
        })
    return rows


def parse_summary_per_asset(path: str) -> list[dict[str, Any]]:
    df = pd.read_excel(path, sheet_name='Summary Per Asset', header=None)
    rows = []
    for _, row in df.iterrows():
        asset = row.iloc[0] if len(row) > 0 else None
        if pd.isna(asset) or str(asset).strip() in ('Asset Number', 'Total'):
            continue
        rows.append({
            'asset_number': str(asset).strip(),
            'asset_description': row.iloc[1] if len(row) > 1 else None,
            'department': row.iloc[2] if len(row) > 2 else None,
            'transaction_count': int(float(row.iloc[3])) if len(row) > 3 and pd.notna(row.iloc[3]) else None,
            'litres': float(row.iloc[4]) if len(row) > 4 and pd.notna(row.iloc[4]) else None,
        })
    return rows


def parse_lookup_60(path: str) -> dict[str, str]:
    try:
        df = pd.read_excel(path, sheet_name='60 min Lookup', header=0)
    except Exception:
        return {}
    lookup = {}
    id_col = 'Transaction ID' if 'Transaction ID' in df.columns else df.columns[0]
    reason_col = 'Exception Reason' if 'Exception Reason' in df.columns else df.columns[1]
    for _, row in df.iterrows():
        tid = row.get(id_col)
        if pd.isna(tid):
            continue
        lookup[str(tid).strip()] = str(row.get(reason_col) or '').strip()
    return lookup


def detect_workbook(path: str) -> dict[str, Any]:
    xl = pd.ExcelFile(path)
    sheet_names = xl.sheet_names
    missing = [s for s in REQUIRED_SHEETS if s not in sheet_names]
    return {
        'valid': len(missing) == 0,
        'missing_sheets': missing,
        'sheet_names': sheet_names,
        'has_review_queue': 'Transactions deemed ineligible' in sheet_names,
        'has_possible_cause': 'Possible Cause Summary' in sheet_names,
    }


def load_workbook(path: str) -> dict[str, Any]:
    detection = detect_workbook(path)
    if not detection['valid']:
        raise ValueError(f"Missing required sheets: {', '.join(detection['missing_sheets'])}")

    details_df = pd.read_excel(path, sheet_name='Details as Assets', header=None)
    transactions = parse_details_sheet(details_df)

    data: dict[str, Any] = {
        'detection': detection,
        'transactions': transactions,
        'review_queue': [],
        'possible_causes': [],
        'summary_per_asset': [],
        'lookup_60': {},
    }

    if detection['has_review_queue']:
        data['review_queue'] = parse_review_queue_simple(path)
    if detection['has_possible_cause']:
        data['possible_causes'] = parse_possible_cause_summary(path)
    if 'Summary Per Asset' in detection['sheet_names']:
        data['summary_per_asset'] = parse_summary_per_asset(path)
    if '60 min Lookup' in detection['sheet_names']:
        data['lookup_60'] = parse_lookup_60(path)

    return data
