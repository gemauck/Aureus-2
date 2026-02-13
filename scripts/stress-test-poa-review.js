#!/usr/bin/env node
/**
 * Stress test for POA Review batch API (and optional Excel upload).
 * Verifies that streaming-to-disk handles large files without OOM/crash.
 *
 * Usage:
 *   node scripts/stress-test-poa-review.js
 *   POA_STRESS_ROWS=100000 node scripts/stress-test-poa-review.js
 *   POA_STRESS_BASE_URL=https://your-app.com POA_STRESS_EMAIL=you@example.com POA_STRESS_PASSWORD=xxx node scripts/stress-test-poa-review.js
 *
 * Env:
 *   POA_STRESS_BASE_URL  - default http://localhost:3000
 *   POA_STRESS_ROWS      - total rows to send (default 25000; try 100000+ for heavy stress)
 *   POA_STRESS_BATCH     - rows per batch (default 1000)
 *   POA_STRESS_EMAIL     - login email (default admin@example.com for dev)
 *   POA_STRESS_PASSWORD  - login password (default password123 for dev)
 *
 * For full run (including Excel output): server needs pandas (run ./scripts/poa-review/setup-venv.sh).
 * To run with server auto-started: ./scripts/run-poa-stress-test.sh [ROWS]
 */

const BASE_URL = (process.env.POA_STRESS_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const TOTAL_ROWS = Math.min(parseInt(process.env.POA_STRESS_ROWS || '25000', 10), 400000);
const BATCH_SIZE = parseInt(process.env.POA_STRESS_BATCH || '1000', 10);
const EMAIL = process.env.POA_STRESS_EMAIL || 'admin@example.com';
const PASSWORD = process.env.POA_STRESS_PASSWORD || 'password123';

function log(msg) {
    const ts = new Date().toISOString();
    console.log(`[${ts}] ${msg}`);
}

/** Generate one row of POA-like data (required columns for ProofReview) */
function generateRow(i) {
    const date = new Date(Date.now() - i * 60000);
    return {
        'Transaction ID': `TXN-${1000000 + i}`,
        'Asset Number': `AST-${(i % 50) + 1}`,
        'Date & Time': date.toISOString().replace('T', ' ').slice(0, 19),
        'Source': 'Stress Test',
        'Quantity': 10 + (i % 100),
        'Unit': 'L'
    };
}

/** Login and return accessToken */
async function login() {
    log(`Login ${EMAIL} @ ${BASE_URL}...`);
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: EMAIL, password: PASSWORD })
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Login failed ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    const token = data?.data?.accessToken ?? data?.accessToken;
    if (!token) throw new Error('No accessToken in login response');
    log('Login OK');
    return token;
}

/** Send one batch to process-batch API */
async function sendBatch(token, batchId, batchNumber, totalBatches, rows, fileName, isFinal) {
    const res = await fetch(`${BASE_URL}/api/poa-review/process-batch`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            batchId,
            batchNumber,
            totalBatches,
            rows,
            sources: ['Stress Test'],
            fileName,
            isFinal
        })
    });
    const text = await res.text();
    let body;
    try {
        body = text ? JSON.parse(text) : {};
    } catch {
        throw new Error(`Batch ${batchNumber} failed ${res.status}: ${text.slice(0, 500)}`);
    }
    if (!res.ok) {
        throw new Error(`Batch ${batchNumber} failed ${res.status}: ${body?.error?.message || text.slice(0, 300)}`);
    }
    return body;
}

/** Run batch stress test: generate TOTAL_ROWS, send in batches of BATCH_SIZE */
async function stressBatches(token) {
    const totalBatches = Math.ceil(TOTAL_ROWS / BATCH_SIZE);
    const batchId = `stress_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const fileName = `stress_test_${TOTAL_ROWS}_rows.xlsx`;

    log(`Batch stress: ${TOTAL_ROWS} rows in ${totalBatches} batches (batch size ${BATCH_SIZE})`);
    const start = Date.now();
    let lastProgress = 0;

    for (let b = 0; b < totalBatches; b++) {
        const batchNumber = b + 1;
        const startRow = b * BATCH_SIZE;
        const endRow = Math.min(startRow + BATCH_SIZE, TOTAL_ROWS);
        const rows = [];
        for (let i = startRow; i < endRow; i++) {
            rows.push(generateRow(i));
        }
        const isFinal = batchNumber === totalBatches;
        await sendBatch(token, batchId, batchNumber, totalBatches, rows, fileName, isFinal);

        const pct = Math.round((batchNumber / totalBatches) * 100);
        if (pct >= lastProgress + 10 || batchNumber === totalBatches) {
            log(`  Progress: ${batchNumber}/${totalBatches} (${pct}%)`);
            lastProgress = pct;
        }
    }

    const elapsed = (Date.now() - start) / 1000;
    log(`Batch stress done in ${elapsed.toFixed(1)}s (${(TOTAL_ROWS / elapsed).toFixed(0)} rows/s)`);
    return { elapsed, totalRows: TOTAL_ROWS, totalBatches };
}

async function main() {
    log('POA Review stress test');
    log(`  BASE_URL=${BASE_URL}  ROWS=${TOTAL_ROWS}  BATCH_SIZE=${BATCH_SIZE}`);
    if (TOTAL_ROWS > 100000) {
        log('  (Large run: server will stream batches to disk; watch for OOM/crash)');
    }

    let token;
    try {
        token = await login();
    } catch (e) {
        console.error('Login failed. Set POA_STRESS_EMAIL and POA_STRESS_PASSWORD, or use dev auth (TEST_DEV_AUTH=true on server).');
        throw e;
    }

    try {
        const batchResult = await stressBatches(token);
        log(`Result: ${batchResult.totalRows} rows in ${batchResult.totalBatches} batches, ${batchResult.elapsed.toFixed(1)}s`);
    } catch (e) {
        console.error('Batch stress failed:', e.message);
        process.exitCode = 1;
    }

    log('Done.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
