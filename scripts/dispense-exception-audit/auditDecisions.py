# Compare manual analyst decisions against recomputed exception rules.
"""Audit manual decisions in dispense exception workbooks."""

from __future__ import annotations

from typing import Any

from exceptionRules import ComputedTransaction, compute_all, compare_reason

DEFAULT_ECONOMY_VARIANCE_THRESHOLD = 5.0  # abs variance > 500%


def _finding(
    check: str,
    severity: str,
    transaction_id: str | None = None,
    asset_number: str | None = None,
    manual_value: str | None = None,
    expected_value: str | None = None,
    evidence: str | None = None,
) -> dict[str, Any]:
    return {
        'transaction_id': transaction_id or '',
        'asset_number': asset_number or '',
        'check': check,
        'severity': severity,
        'manual_value': manual_value or '',
        'expected_value': expected_value or '',
        'evidence': evidence or '',
    }


def should_escalate(comp: ComputedTransaction, abco_comment: str | None, refund_eligibility: str | None = None) -> bool:
    flags = comp.flags
    eligibility = (refund_eligibility or '').strip()
    comment = (abco_comment or '').strip()
    comment_lower = comment.lower()

    if flags.initial_dispense and eligibility == 'Non-Eligible':
        return False
    if comment_lower == 'initial dispense' and eligibility == 'Non-Eligible':
        return False

    if comment and comment_lower != 'initial dispense':
        return True
    if flags.initial_dispense and eligibility != 'Non-Eligible':
        return True
    if flags.fill_outside_hour or flags.odo_jump_50 or flags.over_tank_cumulative or flags.meter_reset:
        return True
    if flags.odo_non_positive and not flags.consec_60:
        return True
    return False


def suggested_cause(comp: ComputedTransaction) -> str | None:
    flags = comp.flags
    if flags.fill_outside_hour:
        return 'Dispensing Point Error?'
    if flags.odo_jump_50 or flags.meter_reset:
        return 'AVR?'
    if flags.over_tank_cumulative:
        return 'Dispensing Point Error?'
    return None


def _looks_like_asset_reset(comp: ComputedTransaction) -> bool:
    return bool(comp.flags.odo_jump_50 or comp.flags.meter_reset)


def audit_exception_accuracy(
    transactions: list[dict[str, Any]],
    computed: dict[str, ComputedTransaction],
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for row in transactions:
        tid = str(row.get('transaction_id') or '')
        comp = computed.get(tid)
        if not comp:
            continue
        for col, label in (('exception_60', 'exception_60'), ('exception_120', 'exception_120')):
            reported = row.get(col)
            if not reported:
                continue
            expected = comp.flags.reason_60() if col == 'exception_60' else comp.flags.reason_120()
            cmp = compare_reason(reported, expected)
            if not cmp['match']:
                severity = 'error' if cmp['missing_from_recompute'] else 'warning'
                findings.append(_finding(
                    check=f'exception_accuracy_{label}',
                    severity=severity,
                    transaction_id=tid,
                    asset_number=row.get('asset_number'),
                    manual_value=reported,
                    expected_value=expected,
                    evidence=f"missing={cmp['missing_from_recompute']}; extra={cmp['extra_in_recompute']}",
                ))
    return findings


def audit_refund_eligibility(
    transactions: list[dict[str, Any]],
    computed: dict[str, ComputedTransaction],
    economy_threshold: float = DEFAULT_ECONOMY_VARIANCE_THRESHOLD,
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for row in transactions:
        tid = str(row.get('transaction_id') or '')
        comp = computed.get(tid)
        if not comp:
            continue
        eligibility = (row.get('refund_eligibility') or '').strip()
        comment = (row.get('abco_comment') or '').strip()
        flags = comp.flags

        if eligibility == 'Non-Eligible' and not flags.initial_dispense:
            findings.append(_finding(
                check='refund_eligibility',
                severity='error',
                transaction_id=tid,
                asset_number=row.get('asset_number'),
                manual_value=eligibility,
                expected_value='Non-Eligible only for initial dispense (opening odo = 0)',
                evidence=f"initial_dispense={flags.initial_dispense}; opening={row.get('opening_odo_num')}",
            ))

        if eligibility == 'Eligible':
            needs_comment = flags.odo_jump_50 or flags.over_tank_cumulative or flags.meter_reset
            if needs_comment and not comment:
                findings.append(_finding(
                    check='refund_eligibility',
                    severity='warning',
                    transaction_id=tid,
                    asset_number=row.get('asset_number'),
                    manual_value=f'{eligibility} (no comment)',
                    expected_value='Eligible with documented Abco Comment',
                    evidence=f"rules={sorted(flags.rule_ids())}",
                ))
    return findings


def audit_abco_comments(
    transactions: list[dict[str, Any]],
    computed: dict[str, ComputedTransaction],
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for row in transactions:
        comment = (row.get('abco_comment') or '').strip()
        if not comment:
            continue
        tid = str(row.get('transaction_id') or '')
        comp = computed.get(tid)
        if not comp:
            continue
        flags = comp.flags
        lower = comment.lower()

        if 'check 120 min' in lower:
            if not (flags.consec_120 or flags.fill_outside_hour):
                findings.append(_finding(
                    check='abco_comment',
                    severity='error',
                    transaction_id=tid,
                    asset_number=row.get('asset_number'),
                    manual_value=comment,
                    expected_value='Comment requires consec_120 or fill_outside_hour',
                    evidence=str(sorted(flags.rule_ids())),
                ))

        if 'asset changed' in lower:
            if not (flags.odo_jump_50 or flags.meter_reset):
                findings.append(_finding(
                    check='abco_comment',
                    severity='error',
                    transaction_id=tid,
                    asset_number=row.get('asset_number'),
                    manual_value=comment,
                    expected_value='Comment requires odo_jump_50 or meter reset pattern',
                    evidence=str(sorted(flags.rule_ids())),
                ))

        if 'initial dispense' in lower:
            if row.get('refund_eligibility') != 'Non-Eligible' or not flags.initial_dispense:
                findings.append(_finding(
                    check='abco_comment',
                    severity='error',
                    transaction_id=tid,
                    asset_number=row.get('asset_number'),
                    manual_value=comment,
                    expected_value='Initial Dispense → Non-Eligible with opening odo = 0',
                    evidence=f"eligibility={row.get('refund_eligibility')}; opening={row.get('opening_odo_num')}",
                ))
    return findings


def audit_review_queue(
    transactions: list[dict[str, Any]],
    computed: dict[str, ComputedTransaction],
    review_queue: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    txn_by_id = {str(t.get('transaction_id')): t for t in transactions}
    queued_ids = {str(r.get('transaction_id')) for r in review_queue if r.get('transaction_id')}

    expected_ids: set[str] = set()
    for row in transactions:
        tid = str(row.get('transaction_id') or '')
        comp = computed.get(tid)
        if not comp:
            continue
        if should_escalate(comp, row.get('abco_comment'), row.get('refund_eligibility')):
            expected_ids.add(tid)

    for tid in sorted(expected_ids - queued_ids):
        row = txn_by_id.get(tid, {})
        findings.append(_finding(
            check='review_queue',
            severity='warning',
            transaction_id=tid,
            asset_number=row.get('asset_number'),
            manual_value='not in review queue',
            expected_value='should be escalated for manual review',
            evidence=str(sorted(computed[tid].flags.rule_ids())) if tid in computed else '',
        ))

    for tid in sorted(queued_ids - expected_ids):
        row = txn_by_id.get(tid, {})
        comp = computed.get(tid)
        findings.append(_finding(
            check='review_queue',
            severity='warning',
            transaction_id=tid,
            asset_number=row.get('asset_number'),
            manual_value='in review queue',
            expected_value='routine split-fill only — verify escalation needed',
            evidence=str(sorted(comp.flags.rule_ids())) if comp else '',
        ))

    manual_litres = sum(float(r.get('litres') or 0) for r in review_queue)
    if review_queue and abs(manual_litres - sum(float(txn_by_id.get(tid, {}).get('litres') or 0) for tid in queued_ids)) > 0.01:
        findings.append(_finding(
            check='review_queue',
            severity='error',
            manual_value=str(manual_litres),
            expected_value='sum of queued transaction litres',
            evidence='litres_mismatch',
        ))

    return findings


def audit_possible_causes(
    transactions: list[dict[str, Any]],
    computed: dict[str, ComputedTransaction],
    possible_causes: list[dict[str, Any]],
    review_queue: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    if not possible_causes:
        return findings

    queued_ids = {str(r.get('transaction_id')) for r in review_queue if r.get('transaction_id')}
    cause_total_count = sum(r.get('transaction_count') or 0 for r in possible_causes)
    cause_total_litres = sum(r.get('litres') or 0 for r in possible_causes)

    if review_queue and cause_total_count != len(review_queue):
        findings.append(_finding(
            check='possible_cause',
            severity='warning',
            manual_value=str(cause_total_count),
            expected_value=str(len(review_queue)),
            evidence='Possible Cause Summary transaction count vs review queue',
        ))

    queue_litres = sum(float(r.get('litres') or 0) for r in review_queue)
    if review_queue and abs(cause_total_litres - queue_litres) > 0.05:
        findings.append(_finding(
            check='possible_cause',
            severity='warning',
            manual_value=f'{cause_total_litres:.2f}',
            expected_value=f'{queue_litres:.2f}',
            evidence='Possible Cause Summary litres vs review queue',
        ))

    # For each queued transaction, verify suggested cause matches manual assignment when present.
    manual_causes = {row['possible_cause'] for row in possible_causes}
    for tid in queued_ids:
        comp = computed.get(tid)
        if not comp:
            continue
        suggested = suggested_cause(comp)
        if suggested and suggested not in manual_causes:
            findings.append(_finding(
                check='possible_cause',
                severity='info',
                transaction_id=tid,
                manual_value='(not in summary)',
                expected_value=suggested,
                evidence='queued transaction cause not represented in Possible Cause Summary',
            ))

    return findings


def audit_cross_sheet_rollups(
    review_queue: list[dict[str, Any]],
    summary_per_asset: list[dict[str, Any]],
    possible_causes: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    queue_count = len(review_queue)
    queue_litres = sum(float(r.get('litres') or 0) for r in review_queue)

    summary_count = sum(r.get('transaction_count') or 0 for r in summary_per_asset)
    summary_litres = sum(r.get('litres') or 0 for r in summary_per_asset)

    if summary_per_asset and summary_count != queue_count:
        findings.append(_finding(
            check='cross_sheet_rollup',
            severity='error',
            manual_value=f'Summary Per Asset count={summary_count}',
            expected_value=f'review queue count={queue_count}',
            evidence='transaction_count mismatch',
        ))

    if summary_per_asset and abs(summary_litres - queue_litres) > 0.05:
        findings.append(_finding(
            check='cross_sheet_rollup',
            severity='error',
            manual_value=f'Summary Per Asset litres={summary_litres:.2f}',
            expected_value=f'review queue litres={queue_litres:.2f}',
            evidence='litres mismatch',
        ))

    cause_count = sum(r.get('transaction_count') or 0 for r in possible_causes)
    if possible_causes and cause_count != queue_count:
        findings.append(_finding(
            check='cross_sheet_rollup',
            severity='warning',
            manual_value=f'Possible Cause count={cause_count}',
            expected_value=f'review queue count={queue_count}',
            evidence='possible cause total transactions',
        ))

    return findings


def audit_economy_outliers(
    transactions: list[dict[str, Any]],
    threshold: float = DEFAULT_ECONOMY_VARIANCE_THRESHOLD,
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for row in transactions:
        variance = row.get('pct_variance')
        if variance is None:
            continue
        abs_var = abs(float(variance))
        if abs_var <= threshold:
            continue
        usage = row.get('total_usage_num')
        # Skip noisy cases: high variance driven by very low usage hour is common on partial fills.
        if abs_var <= 10 and usage is not None and usage <= 1:
            continue
        eligibility = (row.get('refund_eligibility') or '').strip()
        comment = (row.get('abco_comment') or '').strip()
        if eligibility == 'Eligible' and not comment:
            findings.append(_finding(
                check='economy_outlier',
                severity='info',
                transaction_id=str(row.get('transaction_id') or ''),
                asset_number=row.get('asset_number'),
                manual_value=f'Eligible, variance={variance}',
                expected_value='Consider review comment for extreme economy variance',
                evidence=f"threshold={threshold}; usage={usage}",
            ))
    return findings


def run_all_audits(
    workbook_data: dict[str, Any],
    economy_threshold: float = DEFAULT_ECONOMY_VARIANCE_THRESHOLD,
) -> dict[str, Any]:
    transactions = workbook_data['transactions']
    computed = compute_all(transactions)
    review_queue = workbook_data.get('review_queue') or []
    possible_causes = workbook_data.get('possible_causes') or []
    summary_per_asset = workbook_data.get('summary_per_asset') or []

    all_findings: list[dict[str, Any]] = []
    all_findings.extend(audit_exception_accuracy(transactions, computed))
    all_findings.extend(audit_refund_eligibility(transactions, computed, economy_threshold))
    all_findings.extend(audit_abco_comments(transactions, computed))
    all_findings.extend(audit_review_queue(transactions, computed, review_queue))
    all_findings.extend(audit_possible_causes(transactions, computed, possible_causes, review_queue))
    all_findings.extend(audit_cross_sheet_rollups(review_queue, summary_per_asset, possible_causes))
    all_findings.extend(audit_economy_outliers(transactions, economy_threshold))

    critical_findings = [f for f in all_findings if f['severity'] != 'info']
    total_checks = len(all_findings)
    errors = sum(1 for f in critical_findings if f['severity'] == 'error')
    warnings = sum(1 for f in critical_findings if f['severity'] == 'warning')

    decision_points = (
        len(review_queue)
        + len([t for t in transactions if t.get('abco_comment')])
        + len(possible_causes)
        + len([t for t in transactions if t.get('refund_eligibility') == 'Non-Eligible'])
    )
    failed_decisions = errors + warnings
    pass_rate = round(max(0, (decision_points - failed_decisions) / max(decision_points, 1) * 100), 1)

    by_check: dict[str, int] = {}
    for f in all_findings:
        by_check[f['check']] = by_check.get(f['check'], 0) + 1

    exception_60_flagged = sum(1 for t in transactions if t.get('exception_60'))
    exception_match = sum(
        1 for t in transactions
        if t.get('exception_60')
        and compare_reason(t.get('exception_60'), computed[str(t['transaction_id'])].flags.reason_60())['match']
    )

    return {
        'findings': all_findings,
        'summary': {
            'transaction_count': len(transactions),
            'exception_flagged_count': exception_60_flagged,
            'exception_match_pct': round(exception_match / max(exception_60_flagged, 1) * 100, 2),
            'review_queue_count': len(review_queue),
            'finding_count': total_checks,
            'error_count': errors,
            'warning_count': warnings,
            'decision_pass_rate_pct': pass_rate,
            'findings_by_check': by_check,
        },
        'computed': computed,
    }
