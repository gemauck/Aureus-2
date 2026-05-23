/**
 * Client-side preflight for Dispense Exception Audit workbooks.
 */

const REQUIRED_SHEET = 'Details as Assets';
const OPTIONAL_SHEETS = [
    'Transactions deemed ineligible',
    'Possible Cause Summary',
    'Summary Per Asset',
    '60 min Lookup',
];

function isTransactionId(value) {
    if (value == null || value === '') return false;
    const text = String(value).trim();
    if (!text || text.toLowerCase() === 'transaction id') return false;
    if (text.toLowerCase().startsWith('uploaded ')) return false;
    return text.includes('-') || /^\d/.test(text);
}

function parseDate(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

function analyzeDetailsSheet(rows) {
    let transactionCount = 0;
    let exceptionCount = 0;
    let reviewCommentCount = 0;
    let nonEligibleCount = 0;
    const dates = [];
    let headerMap = null;

    const normalize = (v) => String(v || '').trim().toLowerCase();

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row.length) continue;
        const joined = row.slice(0, 5).map(normalize).join('|');
        if (joined.includes('transaction id') && joined.includes('date')) {
            headerMap = {};
            row.forEach((cell, idx) => {
                const h = normalize(cell);
                if (h.includes('transaction id')) headerMap.transactionId = idx;
                if (h.includes('date') && h.includes('time')) headerMap.dateTime = idx;
                if (h === 'exception reason (60 min)' || h.includes('exception reason (60')) headerMap.exception60 = idx;
                if (h.includes('abco comment')) headerMap.abcoComment = idx;
                if (h.includes('refund eligibility')) headerMap.refundEligibility = idx;
            });
            continue;
        }
        if (!headerMap) continue;
        const txnId = row[headerMap.transactionId];
        if (!isTransactionId(txnId)) continue;
        transactionCount += 1;
        const dt = parseDate(row[headerMap.dateTime]);
        if (dt) dates.push(dt);
        const ex60 = headerMap.exception60 != null ? row[headerMap.exception60] : null;
        if (ex60 != null && String(ex60).trim()) exceptionCount += 1;
        const comment = headerMap.abcoComment != null ? row[headerMap.abcoComment] : null;
        if (comment != null && String(comment).trim()) reviewCommentCount += 1;
        const elig = headerMap.refundEligibility != null ? row[headerMap.refundEligibility] : null;
        if (String(elig || '').trim() === 'Non-Eligible') nonEligibleCount += 1;
    }

    dates.sort((a, b) => a - b);
    const dateRangeLabel = dates.length
        ? `${dates[0].toISOString().slice(0, 10)} → ${dates[dates.length - 1].toISOString().slice(0, 10)}`
        : '—';

    return { transactionCount, exceptionCount, reviewCommentCount, nonEligibleCount, dateRangeLabel };
}

function analyzeReviewSheet(rows) {
    let count = 0;
    for (const row of rows) {
        if (!row || !row.length) continue;
        const txn = row[1] != null ? row[1] : row[0];
        if (isTransactionId(txn)) count += 1;
    }
    return count;
}

function preflightWorkbook(workbook) {
    const sheetNames = workbook.SheetNames || [];
    const errors = [];
    const warnings = [];

    if (!sheetNames.includes(REQUIRED_SHEET)) {
        errors.push(`Missing required sheet "${REQUIRED_SHEET}".`);
    }

    OPTIONAL_SHEETS.forEach((name) => {
        if (!sheetNames.includes(name)) {
            warnings.push(`Optional sheet "${name}" not found — some audit checks will be skipped.`);
        }
    });

    let details = {
        transactionCount: 0,
        exceptionCount: 0,
        reviewCommentCount: 0,
        nonEligibleCount: 0,
        dateRangeLabel: '—',
    };
    let reviewQueueCount = 0;

    const XLSX = window.XLSX;
    if (sheetNames.includes(REQUIRED_SHEET) && XLSX?.utils) {
        const detailsRows = XLSX.utils.sheet_to_json(workbook.Sheets[REQUIRED_SHEET], { header: 1, defval: null });
        details = analyzeDetailsSheet(detailsRows);
    }
    if (sheetNames.includes('Transactions deemed ineligible') && XLSX?.utils) {
        const reviewRows = XLSX.utils.sheet_to_json(workbook.Sheets['Transactions deemed ineligible'], { header: 1, defval: null });
        reviewQueueCount = analyzeReviewSheet(reviewRows);
    }

    if (details.transactionCount === 0 && !errors.length) {
        errors.push('No fuel dispense transactions found in "Details as Assets".');
    }

    return {
        ok: errors.length === 0,
        errors,
        warnings,
        sheetNames,
        transactionCount: details.transactionCount,
        exceptionCount: details.exceptionCount,
        reviewCommentCount: details.reviewCommentCount,
        nonEligibleCount: details.nonEligibleCount,
        reviewQueueCount,
        dateRangeLabel: details.dateRangeLabel,
    };
}

function analyzeDispenseExceptionFile(workbook) {
    return preflightWorkbook(workbook);
}

if (typeof window !== 'undefined') {
    window.analyzeDispenseExceptionWorkbook = analyzeDispenseExceptionFile;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { analyzeDispenseExceptionWorkbook: analyzeDispenseExceptionFile, preflightWorkbook };
}
