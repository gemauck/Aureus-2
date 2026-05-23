/**
 * Client-side POA Review analysis (pre-flight validation + summary metrics).
 * Mirrors core rules in scripts/poa-review/ProofReview.py for preview stats.
 */

const COLUMN_SPECS = [
    { key: 'transactionId', label: 'Transaction ID', aliases: ['transaction id', 'transactionid', 'txn id', 'txnid'] },
    { key: 'assetNumber', label: 'Asset Number', aliases: ['asset number', 'assetnumber', 'asset no', 'assetno'] },
    { key: 'dateTime', label: 'Date & Time', aliases: ['date & time', 'date and time', 'datetime', 'timestamp'] },
    { key: 'source', label: 'Source', aliases: ['source'] },
    { key: 'totalSmrUsage', label: 'Total SMR Usage', aliases: ['total smr usage', 'total smr'] },
    { key: 'assetDescription', label: 'Asset Description', aliases: ['asset description'] },
    { key: 'assetGroup', label: 'Asset Group', aliases: ['asset group'] },
    { key: 'activity', label: 'Activity', aliases: ['activity'] },
    { key: 'location', label: 'Location.1', aliases: ['location.1', 'location'] },
    { key: 'material', label: 'Material', aliases: ['material'] },
    { key: 'loadsTonnes', label: 'Loads / Tonnes', aliases: ['loads / tonnes', 'loads/tonnes'] },
    { key: 'operationComment', label: 'Operation Description / Comment', aliases: ['operation description / comment'] },
    { key: 'comments', label: 'Comments', aliases: ['comments'] },
];

const DEFAULT_STRENGTH_RULES = {
    primaryActivities: ['mining', 'excavation', 'load and haul', 'haul', 'hauling', 'loading', 'stripping', 'drilling', 'blasting', 'overburden', 'extraction', 'pit', 'in-pit'],
    secondaryActivities: ['crushing', 'crusher', 'screening', 'processing plant', 'plant operation', 'workshop', 'beneficiation', 'chpp'],
    primaryLocations: ['pit', 'north pit', 'south pit', 'open pit', 'opencast', 'quarry', 'face', 'bench', 'rom', 'in-pit', 'bultfontein', 'np1', 'np2'],
    secondaryLocations: ['plant', 'processing plant', 'crusher', 'workshop', 'office', 'depot', 'chpp', 'prep plant', 'stockyard'],
    primaryMaterials: ['coal', 'rom', 'overburden', 'topsoil', 'hards', 'softs', 'waste', 'ore'],
    secondaryMaterials: ['processed', 'crushed', 'screened', 'product coal', 'fines'],
    intensityTextKeywords: ['load', 'loads', 'haul', 'tonne', 'hour', 'hours', 'hr', 'km', 'shift'],
};

function containsAny(text, terms) {
    const t = String(text || '').toLowerCase();
    if (!t) return null;
    for (const term of terms) {
        if (term && t.includes(String(term).toLowerCase())) return term;
    }
    return null;
}

function tierFromScore(score) {
    if (score >= 4) return 'Strong';
    if (score === 3) return 'Moderate';
    if (score >= 1) return 'Weak';
    return 'Insufficient';
}

function evaluateBatchStrength(batch, rules = DEFAULT_STRENGTH_RULES) {
    if (!batch.proofCount) {
        return { strength: 'Insufficient', shortfalls: ['No proof-of-activity rows for this batch'], score: 0 };
    }
    const text = batch.combinedText || '';
    const activityText = batch.activityText || '';
    const shortfalls = [];

    const secAct = containsAny(activityText || text, rules.secondaryActivities);
    const priAct = containsAny(activityText || text, rules.primaryActivities);
    let activityOk;
    if (secAct && !priAct) {
        activityOk = false;
        shortfalls.push(`Secondary/non-primary activity detected (${secAct})`);
    } else if (priAct) activityOk = true;
    else if (activityText || text.trim()) {
        activityOk = false;
        shortfalls.push('No primary Schedule 6 production activity identified');
    } else {
        activityOk = false;
        shortfalls.push('No activity description in proof records');
    }

    const locText = batch.locText || '';
    const secLoc = containsAny(locText || text, rules.secondaryLocations);
    const priLoc = containsAny(locText || text, rules.primaryLocations);
    let locationOk;
    if (!locText.trim() && !containsAny(text, rules.primaryLocations)) {
        locationOk = false;
        shortfalls.push('No mine/pit location on proof records');
    } else if (secLoc && !priLoc) {
        locationOk = false;
        shortfalls.push(`Secondary location only (${secLoc})`);
    } else if (priLoc || locText.trim()) locationOk = true;
    else {
        locationOk = false;
        shortfalls.push('No primary mine location identified');
    }

    const matText = batch.matText || '';
    const secMat = containsAny(matText || text, rules.secondaryMaterials);
    const priMat = containsAny(matText || text, rules.primaryMaterials);
    let materialOk;
    if (!matText.trim()) {
        materialOk = false;
        shortfalls.push('No material type on proof records');
    } else if (secMat && !priMat) {
        materialOk = false;
        shortfalls.push(`Secondary/processed material only (${secMat})`);
    } else if (priMat || matText.trim()) materialOk = true;
    else {
        materialOk = false;
        shortfalls.push('No primary production material identified');
    }

    let intensityOk = Object.keys(batch.intensityValues || {}).length > 0;
    if (!intensityOk && containsAny(text, rules.intensityTextKeywords)) intensityOk = true;
    if (!intensityOk) shortfalls.push('No usage intensity (loads, SMR, hours, or hauls)');

    const score = [activityOk, locationOk, materialOk, intensityOk].filter(Boolean).length;
    return { strength: tierFromScore(score), shortfalls, score };
}

function summarizeStrengthResults(labelResults) {
    const tiers = { Strong: 0, Moderate: 0, Weak: 0, Insufficient: 0 };
    const shortfallCounts = {};
    labelResults.forEach((res) => {
        tiers[res.strength] = (tiers[res.strength] || 0) + 1;
        (res.shortfalls || []).forEach((sf) => {
            shortfallCounts[sf] = (shortfallCounts[sf] || 0) + 1;
        });
    });
    const total = Object.values(tiers).reduce((a, b) => a + b, 0) || 1;
    const topShortfalls = Object.entries(shortfallCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([text, count]) => ({ text, count }));
    return {
        tierCounts: tiers,
        tierPct: Object.fromEntries(Object.entries(tiers).map(([k, v]) => [k, Math.round((v / total) * 1000) / 10])),
        topShortfalls,
        totalBatches: total,
    };
}

function evaluatePoaStrengthFromRecords(records) {
    const proofByLabel = {};
    records.filter((r) => r.isProof && r.label).forEach((r) => {
        if (!proofByLabel[r.label]) proofByLabel[r.label] = [];
        proofByLabel[r.label].push(r);
    });

    const txnLabels = new Set(records.filter((r) => r.isTransaction && r.label).map((r) => r.label));
    const labelResults = {};

    txnLabels.forEach((label) => {
        const proofs = proofByLabel[label] || [];
        const activities = [];
        const locations = [];
        const materials = [];
        const comments = [];
        const intensityValues = {};

        proofs.forEach((p) => {
            if (p.activity) activities.push(p.activity);
            if (p.location) locations.push(p.location);
            if (p.material) materials.push(p.material);
            if (p.comments) comments.push(p.comments);
            if (p.operationComment) comments.push(p.operationComment);
            if (p.loadsTonnes > 0) intensityValues['Loads / Tonnes'] = (intensityValues['Loads / Tonnes'] || 0) + p.loadsTonnes;
            if (p.smrUsage > 0) intensityValues['Total SMR Usage'] = (intensityValues['Total SMR Usage'] || 0) + p.smrUsage;
        });

        const combinedText = [...activities, ...locations, ...materials, ...comments].join(' | ');
        const batch = {
            proofCount: proofs.length,
            activityText: activities.join(' | '),
            locText: locations.join(' | '),
            matText: materials.join(' | '),
            combinedText,
            intensityValues,
        };
        labelResults[label] = evaluateBatchStrength(batch);
    });

    return summarizeStrengthResults(Object.values(labelResults));
}

const ONE_HOUR_MS = 60 * 60 * 1000;

function normalizeHeader(name) {
    if (name == null) return '';
    return String(name).trim().toLowerCase();
}

function findColumnKey(headers, aliases) {
    const normalized = headers.map((h) => ({ raw: h, norm: normalizeHeader(h) }));
    for (const alias of aliases) {
        const hit = normalized.find((h) => h.norm === alias);
        if (hit) return hit.raw;
    }
    return null;
}

function resolveColumns(headers) {
    const cols = {};
    for (const spec of COLUMN_SPECS) {
        cols[spec.key] = findColumnKey(headers, spec.aliases);
    }
    return cols;
}

function cellVal(row, colKey) {
    if (!colKey || !row) return '';
    const v = row[colKey];
    if (v == null) return '';
    return String(v).trim();
}

function parseDate(value) {
    const s = String(value ?? '').trim();
    if (!s) return null;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return d;
}

function formatDateShort(d) {
    if (!d) return '—';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * @param {Record<string, string>[]} rows
 * @param {{ sources?: string[], analyzedRowCount?: number, fileRowHint?: number }} [options]
 */
export function analyzePoaRows(rows, options = {}) {
    const sources = Array.isArray(options.sources) ? options.sources.filter(Boolean) : [];
    const analyzedRowCount = options.analyzedRowCount ?? (rows?.length || 0);
    const fileRowHint = options.fileRowHint ?? analyzedRowCount;

    const empty = {
        ok: false,
        errors: ['No data rows found in file'],
        warnings: [],
        columns: {},
        rowCount: 0,
        analyzedRowCount: 0,
        truncated: false,
        transactionCount: 0,
        proofCount: 0,
        uniqueAssets: 0,
        dateMin: null,
        dateMax: null,
        badDateCount: 0,
        duplicateTxnIdCount: 0,
        noPoaAssetCount: 0,
        noPoaAssetsSample: [],
        transactionsOnNoPoaAssets: 0,
        transactionsWithZeroProof: 0,
        transactionsWithProof: 0,
        transactionCompliancePct: 0,
        assetCompliancePct: 0,
        smrTotalSelectedSources: 0,
        medianHoursSinceProof: null,
        topGapAssets: [],
        strengthSummary: null,
    };

    if (!rows || rows.length === 0) return empty;

    const headers = Object.keys(rows[0] || {});
    const cols = resolveColumns(headers);
    const errors = [];
    const warnings = [];

    if (!cols.transactionId) errors.push('Missing column: Transaction ID');
    if (!cols.assetNumber) errors.push('Missing column: Asset Number');
    if (!cols.dateTime) errors.push('Missing column: Date & Time');

    const records = [];
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const txnId = cellVal(row, cols.transactionId);
        const asset = cellVal(row, cols.assetNumber);
        const dt = parseDate(cellVal(row, cols.dateTime));
        const isTransaction = Boolean(txnId) && txnId !== 'Transaction ID';
        const isProof = !txnId && Boolean(asset) && asset !== 'Asset Number';
        if (!isTransaction && !isProof) continue;

        records.push({
            rowIndex: i,
            isTransaction,
            isProof,
            asset,
            dt,
            txnId: isTransaction ? txnId : '',
            source: cellVal(row, cols.source),
            smrUsage: parseFloat(String(cellVal(row, cols.totalSmrUsage) || '').replace(/,/g, '')) || 0,
            assetDescription: cellVal(row, cols.assetDescription),
            assetGroup: cellVal(row, cols.assetGroup),
            activity: cellVal(row, cols.activity),
            location: cellVal(row, cols.location),
            material: cellVal(row, cols.material),
            comments: cellVal(row, cols.comments),
            operationComment: cellVal(row, cols.operationComment),
            loadsTonnes: parseFloat(String(cellVal(row, cols.loadsTonnes) || '').replace(/,/g, '')) || 0,
            label: null,
        });
    }

    const transactions = records.filter((r) => r.isTransaction);
    const proofs = records.filter((r) => r.isProof);

    if (transactions.length === 0) {
        errors.push('No transaction rows found (rows with a Transaction ID)');
    }

    const truncated = fileRowHint > analyzedRowCount;
    if (truncated) {
        warnings.push(
            `Analysis based on first ${analyzedRowCount.toLocaleString()} of ~${fileRowHint.toLocaleString()} rows. Full report may differ slightly.`
        );
    }

    const proofAssets = new Set(proofs.map((p) => p.asset).filter(Boolean));
    const txnAssets = new Set(transactions.map((t) => t.asset).filter(Boolean));
    const noPoaAssets = [...txnAssets].filter((a) => !proofAssets.has(a));
    const noPoaAssetSet = new Set(noPoaAssets);

    const transactionsOnNoPoaAssets = transactions.filter((t) => noPoaAssetSet.has(t.asset)).length;

    const txnIdCounts = {};
    transactions.forEach((t) => {
        if (t.txnId) txnIdCounts[t.txnId] = (txnIdCounts[t.txnId] || 0) + 1;
    });
    const duplicateTxnIdCount = Object.values(txnIdCounts).filter((c) => c > 1).length;
    if (duplicateTxnIdCount > 0) {
        warnings.push(`${duplicateTxnIdCount.toLocaleString()} duplicate Transaction ID(s) detected`);
    }

    const badDateCount =
        transactions.filter((t) => !t.dt).length + proofs.filter((p) => !p.dt).length;
    if (badDateCount > 0) {
        warnings.push(`${badDateCount.toLocaleString()} row(s) have unparseable Date & Time values`);
    }

    const dated = records.map((r) => r.dt).filter(Boolean);
    const dateMin = dated.length ? new Date(Math.min(...dated.map((d) => d.getTime()))) : null;
    const dateMax = dated.length ? new Date(Math.max(...dated.map((d) => d.getTime()))) : null;

    if (sources.length > 0 && cols.source) {
        const sourceSet = new Set(
            records.map((r) => r.source).filter((s) => s && !/^source$/i.test(s))
        );
        const missingSelected = sources.filter((s) => !sourceSet.has(s));
        if (missingSelected.length === sources.length) {
            warnings.push('None of the selected SMR sources appear in this file');
        } else if (missingSelected.length > 0) {
            warnings.push(
                `${missingSelected.length} selected SMR source(s) not found in file: ${missingSelected.slice(0, 3).join(', ')}${missingSelected.length > 3 ? '…' : ''}`
            );
        }
    }

    let transactionsWithZeroProof = 0;
    let transactionsWithProof = 0;
    const gapHoursList = [];

    const byAsset = {};
    records.forEach((r) => {
        if (!r.asset) return;
        if (!byAsset[r.asset]) byAsset[r.asset] = [];
        byAsset[r.asset].push(r);
    });

    for (const asset of Object.keys(byAsset)) {
        const timeline = byAsset[asset].slice().sort((a, b) => {
            if (!a.dt && !b.dt) return 0;
            if (!a.dt) return 1;
            if (!b.dt) return -1;
            return a.dt - b.dt;
        });

        let groupNum = 0;
        let prevTxnTime = null;
        for (const rec of timeline) {
            if (!rec.isTransaction) continue;
            let isNewGroup = 1;
            if (prevTxnTime && rec.dt) {
                const diff = rec.dt - prevTxnTime;
                if (diff > 0 && diff < ONE_HOUR_MS) isNewGroup = 0;
            }
            groupNum += isNewGroup;
            rec.label = `${asset}-${groupNum}`;
            prevTxnTime = rec.dt || prevTxnTime;
        }

        let nextLabel = null;
        for (let i = timeline.length - 1; i >= 0; i--) {
            if (timeline[i].isTransaction && timeline[i].label) {
                nextLabel = timeline[i].label;
            } else if (timeline[i].isProof && nextLabel) {
                timeline[i].label = nextLabel;
            }
        }

        const proofCountByLabel = {};
        timeline.forEach((rec) => {
            if (rec.isProof && rec.label) {
                proofCountByLabel[rec.label] = (proofCountByLabel[rec.label] || 0) + 1;
            }
        });

        let lastProofTime = null;
        for (const rec of timeline) {
            if (rec.isProof && rec.dt) lastProofTime = rec.dt;
            if (!rec.isTransaction) continue;

            const count = rec.label ? proofCountByLabel[rec.label] || 0 : 0;
            if (count > 0) transactionsWithProof += 1;
            else transactionsWithZeroProof += 1;

            if (rec.dt && lastProofTime) {
                const hours = (rec.dt - lastProofTime) / ONE_HOUR_MS;
                if (hours >= 0 && Number.isFinite(hours)) {
                    gapHoursList.push({ asset, hours, assetDescription: rec.assetDescription });
                }
            }
        }
    }

    const transactionCompliancePct =
        transactions.length > 0
            ? Math.round((transactionsWithProof / transactions.length) * 1000) / 10
            : 0;

    const assetsWithProof = [...txnAssets].filter((a) => proofAssets.has(a)).length;
    const assetCompliancePct =
        txnAssets.size > 0 ? Math.round((assetsWithProof / txnAssets.size) * 1000) / 10 : 0;

    const sourceSet = new Set(sources);
    let smrTotalSelectedSources = 0;
    if (sources.length > 0 && cols.source) {
        records.forEach((r) => {
            if (sourceSet.has(r.source)) smrTotalSelectedSources += r.smrUsage;
        });
    }

    let medianHoursSinceProof = null;
    const topGapAssets = [];
    if (gapHoursList.length > 0) {
        const sorted = gapHoursList.map((g) => g.hours).sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        medianHoursSinceProof =
            sorted.length % 2 === 0
                ? Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10
                : Math.round(sorted[mid] * 10) / 10;

        const byAssetGap = {};
        gapHoursList.forEach((g) => {
            if (!byAssetGap[g.asset] || g.hours > byAssetGap[g.asset].hours) {
                byAssetGap[g.asset] = g;
            }
        });
        topGapAssets.push(
            ...Object.values(byAssetGap)
                .sort((a, b) => b.hours - a.hours)
                .slice(0, 5)
                .map((g) => ({
                    asset: g.asset,
                    hours: Math.round(g.hours * 10) / 10,
                    label: g.assetDescription || g.asset,
                }))
        );
    }

    const noPoaAssetsSample = noPoaAssets.slice(0, 8);

    if (noPoaAssets.length > 0) {
        warnings.push(
            `${noPoaAssets.length.toLocaleString()} asset(s) have transactions but no proof-of-activity rows`
        );
    }

    if (transactions.length > 0 && transactionsWithZeroProof / transactions.length > 0.25) {
        warnings.push(
            `${Math.round((transactionsWithZeroProof / transactions.length) * 100)}% of transactions have zero proof before transaction in analyzed data`
        );
    }

    const strengthSummary = evaluatePoaStrengthFromRecords(records);

    return {
        ok: errors.length === 0,
        errors,
        warnings,
        columns: cols,
        rowCount: rows.length,
        analyzedRowCount,
        truncated,
        transactionCount: transactions.length,
        proofCount: proofs.length,
        uniqueAssets: txnAssets.size,
        dateMin,
        dateMax,
        dateRangeLabel:
            dateMin && dateMax
                ? `${formatDateShort(dateMin)} – ${formatDateShort(dateMax)}`
                : '—',
        badDateCount,
        duplicateTxnIdCount,
        noPoaAssetCount: noPoaAssets.length,
        noPoaAssetsSample,
        transactionsOnNoPoaAssets,
        transactionsWithZeroProof,
        transactionsWithProof,
        transactionCompliancePct,
        assetCompliancePct,
        smrTotalSelectedSources: Math.round(smrTotalSelectedSources * 100) / 100,
        medianHoursSinceProof,
        topGapAssets,
        strengthSummary,
    };
}

if (typeof window !== 'undefined') {
    window.analyzePoaRows = analyzePoaRows;
    window.evaluatePoaStrengthFromRecords = evaluatePoaStrengthFromRecords;
}
