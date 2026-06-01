/**
 * POA Review Batch Processing API Endpoint
 * 
 * Processes data in chunks to prevent server crashes with large files.
 * Accumulates results and generates final report when all batches are complete.
 * Enforces row limits to avoid OOM and server crash.
 */

import fs from 'fs';
import path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import { withHttp } from '../_lib/withHttp.js';
import { withLogging } from '../_lib/logger.js';
import { authRequired } from '../_lib/authRequired.js';
import { created, badRequest, serverError, ok } from '../_lib/response.js';
import { parseJsonBody } from '../_lib/body.js';
import { prisma } from '../_lib/prisma.js';
import { loadPoaReviewSettings, normalizePoaReviewSettings } from './_lib/poaReviewSettings.js';

const execAsync = promisify(exec);

// Limits: large files use streaming Excel write (write_only) to stay within server memory
const MAX_TOTAL_ROWS = 500000;
const MAX_ROWS_PER_BATCH = 25000; // Reject single batch if it has more rows

// Store batch metadata only (no row data); batches are streamed to disk
const batchStore = new Map();

/** Path to persisted batch metadata (shared across workers via disk) */
function getMetaPath(batchId, tempDir) {
    return path.join(tempDir, `${batchId}_meta.json`);
}

/** Load batch metadata from disk if present (for multi-worker: another worker may have stored it) */
function loadBatchMeta(batchId, tempDir) {
    const metaPath = getMetaPath(batchId, tempDir);
    if (!fs.existsSync(metaPath)) return null;
    try {
        const raw = fs.readFileSync(metaPath, 'utf8');
        const meta = JSON.parse(raw);
        if (meta && typeof meta.totalBatches === 'number') return meta;
    } catch (e) {
        console.warn('POA Review Batch API - Failed to load batch meta:', batchId, e.message);
    }
    return null;
}

/** Persist batch metadata to disk so other workers can load it */
function saveBatchMeta(batchId, tempDir, batchData) {
    const metaPath = getMetaPath(batchId, tempDir);
    const meta = {
        csvDir: batchData.csvDir,
        headers: batchData.headers,
        batchFilePaths: batchData.batchFilePaths || [],
        totalBatches: batchData.totalBatches,
        sources: batchData.sources,
        settings: batchData.settings,
        columnMapping: batchData.columnMapping,
        fileName: batchData.fileName,
        receivedBatches: batchData.receivedBatches,
        receivedRowCount: batchData.receivedRowCount,
        startTime: batchData.startTime
    };
    fs.writeFileSync(metaPath, JSON.stringify(meta), 'utf8');
}

/** Remove persisted batch metadata (on success, failure, or cleanup) */
function deleteBatchMeta(batchId, tempDir) {
    const metaPath = getMetaPath(batchId, tempDir);
    try {
        if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
    } catch (_) {}
}

/** Escape a value for CSV (commas, quotes, newlines) */
function escapeCsv(val) {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

/** Build CSV header line from headers array */
function csvHeaderLine(headers) {
    return headers.map(h => escapeCsv(String(h || '').trim())).join(',');
}

/** Build CSV row line from row object and headers */
function csvRowLine(row, headers) {
    return headers.map(header => {
        const val = row[header] !== undefined ? row[header] : '';
        return escapeCsv(val);
    }).join(',');
}

/** Get unique column headers from an array of row objects */
function getHeadersFromRows(rows) {
    const allHeaders = new Set();
    for (const row of rows) {
        if (row && typeof row === 'object') {
            for (const key of Object.keys(row)) {
                const trimmed = String(key || '').trim();
                if (trimmed && trimmed !== '' && !trimmed.match(/^Unnamed:/i)) {
                    allHeaders.add(trimmed);
                }
            }
        }
    }
    const headers = Array.from(allHeaders);
    if (headers.length === 0) throw new Error('No valid column headers found in data rows');
    return headers;
}

/**
 * Write one batch to a CSV file (header + rows for first batch, rows only otherwise).
 * Uses no extra in-memory copy of the full dataset.
 */
function writeBatchToCsvFile(batchNumber, rows, headers, csvPath) {
    const includeHeader = batchNumber === 1;
    const lines = [];
    if (includeHeader) lines.push(csvHeaderLine(headers));
    for (const row of rows) {
        lines.push(csvRowLine(row, headers));
    }
    fs.writeFileSync(csvPath, lines.join('\n') + '\n', 'utf8');
}

async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return badRequest(res, 'Method not allowed');
        }

        let payload;
        try {
            payload = await parseJsonBody(req);
        } catch (parseError) {
            console.error('POA Review Batch API - JSON parse error:', parseError);
            return badRequest(res, `Invalid JSON payload: ${parseError.message}`);
        }

        const {
            batchId,
            batchNumber,
            totalBatches,
            rows,
            sources,
            settings: payloadSettings,
            columnMapping: payloadColumnMapping,
            fileName,
            isFinal,
        } = payload || {};

        console.log('POA Review Batch API - Received batch:', { 
            batchId, 
            batchNumber, 
            totalBatches, 
            rowCount: rows?.length,
            isFinal 
        });

        if (!batchId || !rows || !Array.isArray(rows)) {
            return badRequest(res, 'batchId and rows array are required');
        }

        if (rows.length > MAX_ROWS_PER_BATCH) {
            return res.status(413).setHeader('Content-Type', 'application/json').end(JSON.stringify({
                error: {
                    code: 'POA_TOO_MANY_ROWS',
                    message: `This batch has too many rows (${rows.length}). Maximum ${MAX_ROWS_PER_BATCH} rows per batch. Use a smaller batch size or split your file.`
                }
            }));
        }

        // Get root directory
        const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
        const outputDir = path.join(rootDir, 'uploads', 'poa-review-outputs');
        const scriptsDir = path.join(rootDir, 'scripts', 'poa-review');
        const tempDir = path.join(rootDir, 'uploads', 'poa-review-temp');

        // Resolve Python: use venv if present, otherwise system python3
        const venvPythonPath = path.join(rootDir, 'venv-poareview', 'bin', 'python3');
        const venvPython = fs.existsSync(venvPythonPath) ? venvPythonPath : 'python3';
        if (venvPython === 'python3') {
            console.log('POA Review Batch API - venv-poareview not found, using system python3');
        }

        // Ensure directories exist
        [outputDir, scriptsDir, tempDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });

        // Initialize or get batch store (metadata only; batches streamed to disk).
        // Load from disk if another worker already created this batch (shared state across workers).
        if (!batchStore.has(batchId)) {
            const diskMeta = loadBatchMeta(batchId, tempDir);
            if (diskMeta) {
                batchStore.set(batchId, {
                    csvDir: diskMeta.csvDir || tempDir,
                    headers: diskMeta.headers,
                    batchFilePaths: diskMeta.batchFilePaths || [],
                    totalBatches: diskMeta.totalBatches,
                    sources: diskMeta.sources || ['Inmine: Daily Diesel Issues'],
                    settings: diskMeta.settings || null,
                    columnMapping: diskMeta.columnMapping || null,
                    fileName: diskMeta.fileName || 'poa-review',
                    receivedBatches: diskMeta.receivedBatches || 0,
                    receivedRowCount: diskMeta.receivedRowCount || 0,
                    startTime: diskMeta.startTime || Date.now()
                });
            } else {
                batchStore.set(batchId, {
                    csvDir: tempDir,
                    headers: null,
                    batchFilePaths: [], // index i = path for batch (i+1)
                    totalBatches: totalBatches || 1,
                    sources: sources || ['Inmine: Daily Diesel Issues'],
                    settings: payloadSettings || null,
                    columnMapping: payloadColumnMapping || null,
                    fileName: fileName || 'poa-review',
                    receivedBatches: 0,
                    receivedRowCount: 0,
                    startTime: Date.now()
                });
            }
        }

        const batchData = batchStore.get(batchId);

        // Batch 1 must arrive first so we can derive headers; no row data is kept in memory
        if (batchData.headers === null && batchNumber !== 1) {
            return badRequest(res, 'The server no longer has the data from the previous batches (the session may have expired or an error occurred). Please run the process again from the start: upload your file and click Process & Generate Report again.');
        }

        if (batchNumber === 1) {
            batchData.headers = getHeadersFromRows(rows);
            console.log('POA Review Batch API - CSV Headers (from batch 1):', batchData.headers.length);
        }

        const batchCsvPath = path.join(batchData.csvDir, `${batchId}_batch_${batchNumber}.csv`);
        writeBatchToCsvFile(batchNumber, rows, batchData.headers, batchCsvPath);
        batchData.batchFilePaths[batchNumber - 1] = batchCsvPath;
        batchData.receivedBatches++;
        batchData.receivedRowCount += rows.length;
        saveBatchMeta(batchId, tempDir, batchData);

        // If this is the final batch or we've received all batches, process everything
        const allBatchesReceived = isFinal || batchData.receivedBatches >= batchData.totalBatches;

        if (allBatchesReceived) {
            const totalRowsReceived = batchData.receivedRowCount;
            const expectedBatches = batchData.totalBatches;
            const receivedBatches = batchData.receivedBatches;

            console.log('POA Review Batch API - All batches received, merging CSV files...', {
                batchId,
                expectedBatches,
                receivedBatches,
                totalRowsReceived,
                isFinal
            });

            // Enforce total row limit to avoid server OOM/crash
            if (totalRowsReceived > MAX_TOTAL_ROWS) {
                for (const p of batchData.batchFilePaths) {
                    if (p && fs.existsSync(p)) try { fs.unlinkSync(p); } catch (_) {}
                }
                deleteBatchMeta(batchId, tempDir);
                batchStore.delete(batchId);
                return res.status(413).setHeader('Content-Type', 'application/json').end(JSON.stringify({
                    error: {
                        code: 'POA_TOO_MANY_ROWS',
                        message: `This file has too many rows (${totalRowsReceived}). Maximum ${MAX_TOTAL_ROWS.toLocaleString()} rows are supported to avoid the server running out of memory. Please split your file (e.g. by month — one file per month) and run POA Review on each file separately.`
                    }
                }));
            }

            if (receivedBatches < expectedBatches && !isFinal) {
                console.warn(`POA Review Batch API - WARNING: Only received ${receivedBatches} of ${expectedBatches} batches, processing anyway`);
            }

            const missingBatches = [];
            for (let i = 0; i < expectedBatches; i++) {
                if (!batchData.batchFilePaths[i]) missingBatches.push(i + 1);
            }
            if (missingBatches.length > 0) {
                console.warn(`POA Review Batch API - WARNING: Missing batch numbers: ${missingBatches.join(', ')}`);
            }

            try {
                // Merge batch CSV files in order into one file (streaming: low memory, faster for large batches)
                const tempCsvPath = path.join(tempDir, `${batchId}_data.csv`);
                const firstPath = batchData.batchFilePaths[0];
                if (!firstPath || !fs.existsSync(firstPath)) {
                    throw new Error('No data from batch 1. The server lost the previous batches. Please run the process again from the start (upload your file and click Process & Generate Report again).');
                }
                fs.copyFileSync(firstPath, tempCsvPath);
                for (let i = 1; i < batchData.batchFilePaths.length; i++) {
                    const p = batchData.batchFilePaths[i];
                    if (p && fs.existsSync(p)) {
                        const appendStream = createWriteStream(tempCsvPath, { flags: 'a' });
                        await pipeline(
                            createReadStream(p, { encoding: 'utf8' }),
                            appendStream
                        );
                    }
                }
                console.log('POA Review Batch API - Merged temp CSV:', tempCsvPath, 'rows:', totalRowsReceived);

                // Convert CSV to Excel and process
                const timestamp = Date.now();
                const baseName = path.basename(batchData.fileName, path.extname(batchData.fileName));
                const outputFileName = `${baseName}_review_${timestamp}.xlsx`;
                const outputFilePath = path.join(outputDir, outputFileName);

                const orgSettings = await loadPoaReviewSettings(prisma);
                const settings = normalizePoaReviewSettings({
                    ...orgSettings,
                    ...(batchData.settings || {}),
                });
                const columnMapping = batchData.columnMapping || {};
                const processScriptPath = path.join(scriptsDir, 'process_poa_csv.py');
                const pythonExec = venvPython === 'python3' ? 'python3' : `"${venvPython}"`;
                const quotedArgs = [
                    processScriptPath,
                    tempCsvPath,
                    outputFilePath,
                    JSON.stringify(batchData.sources),
                    String(MAX_TOTAL_ROWS),
                    JSON.stringify(settings),
                    JSON.stringify(columnMapping),
                ]
                    .map((arg) => `"${String(arg).replace(/"/g, '\\"')}"`)
                    .join(' ');
                const pythonCommand = `${pythonExec} ${quotedArgs} 2>&1`;

                console.log('POA Review Batch API - Executing process_poa_csv.py...');
                
                let stdout, stderr, exitCode;
                try {
                    const result = await execAsync(pythonCommand, {
                        cwd: scriptsDir,
                        maxBuffer: 20 * 1024 * 1024, // 20MB buffer for large file output
                        timeout: 600000 // 10 minutes for large files (write_only path)
                    });
                    stdout = result.stdout || '';
                    stderr = result.stderr || '';
                    exitCode = 0;
                } catch (execError) {
                    stdout = execError.stdout || '';
                    stderr = execError.stderr || '';
                    exitCode = execError.code || 1;
                    
                    // Log full error details
                    console.error('POA Review Batch API - Python execution error:', {
                        message: execError.message,
                        code: execError.code,
                        signal: execError.signal,
                        stdout: stdout.substring(0, 2000),
                        stderr: stderr.substring(0, 2000),
                        fullStdout: stdout.length,
                        fullStderr: stderr.length
                    });
                    
                    // Combine stdout and stderr for full error message
                    // Python errors often go to stdout when using 2>&1
                    const fullError = stdout || stderr || execError.message || 'Unknown Python error';
                    
                    // Extract the actual error message (usually after "Error:" or in traceback)
                    let errorMessage = fullError;
                    const errorMatch = fullError.match(/Error[:\s]+(.+?)(?:\n|$)/i) || 
                                      fullError.match(/Traceback.*?\n(.+?)(?:\n|$)/s);
                    if (errorMatch) {
                        errorMessage = errorMatch[1] || errorMatch[0];
                    }
                    
                    // Limit error message length but include key info
                    const truncatedError = fullError.length > 2000 
                        ? fullError.substring(0, 2000) + '... (truncated)'
                        : fullError;
                    
                    throw new Error(`Python script execution failed (exit code ${exitCode}):\n${truncatedError}`);
                }

                // Check exit code - if Python script exited with non-zero, it failed
                if (exitCode !== 0) {
                    const fullError = [stdout, stderr].filter(Boolean).join('\n');
                    throw new Error(`Python script exited with code ${exitCode}:\n${fullError.substring(0, 2000)}`);
                }

                console.log('POA Review Batch API - Python script output:', stdout.substring(0, 500));

                // Check if output file was created
                if (!fs.existsSync(outputFilePath)) {
                    throw new Error(`Output file was not created. Python output: ${stdout}\nErrors: ${stderr}`);
                }

                // Clean up temp files (merged CSV, per-batch CSVs)
                try {
                    if (fs.existsSync(tempCsvPath)) fs.unlinkSync(tempCsvPath);
                    for (const p of batchData.batchFilePaths) {
                        if (p && fs.existsSync(p)) fs.unlinkSync(p);
                    }
                } catch (cleanupError) {
                    console.warn('POA Review Batch API - Cleanup error:', cleanupError);
                }

                // Clean up batch store and disk meta
                deleteBatchMeta(batchId, tempDir);
                batchStore.delete(batchId);

                // Return download URL
                const downloadUrl = `/uploads/poa-review-outputs/${outputFileName}`;
                const processingTime = ((Date.now() - batchData.startTime) / 1000).toFixed(1);

                return ok(res, {
                    success: true,
                    downloadUrl,
                    fileName: outputFileName,
                    processingTime,
                    totalRows: batchData.receivedRowCount
                });

            } catch (error) {
                console.error('POA Review Batch API - Processing error:', error);
                console.error('POA Review Batch API - Error stack:', error.stack);
                console.error('POA Review Batch API - Error details:', {
                    message: error.message,
                    name: error.name,
                    batchId,
                    receivedBatches: batchData?.receivedBatches,
                    totalBatches: batchData?.totalBatches,
                    stdout: error.stdout,
                    stderr: error.stderr
                });
                // Only remove merged CSV and Python script so retry can re-run merge + Python.
                // Keep batch store, meta file, and per-batch CSV files so client retry of batch 39 works.
                try {
                    const tempCsvPath = path.join(tempDir, `${batchId}_data.csv`);
                    if (fs.existsSync(tempCsvPath)) fs.unlinkSync(tempCsvPath);
                    const scriptPrefix = `process_batch_${batchId}_`;
                    if (fs.existsSync(scriptsDir)) {
                        for (const name of fs.readdirSync(scriptsDir)) {
                            if (name.startsWith(scriptPrefix) && name.endsWith('.py')) {
                                try { fs.unlinkSync(path.join(scriptsDir, name)); } catch (_) {}
                            }
                        }
                    }
                } catch (_) {}
                // Do not delete batchStore, meta, or batchFilePaths - allow retry

                // Return more detailed error information
                let errorMessage = error.message || 'Unknown error occurred';
                let errorDetails = errorMessage;

                // Exit code 137 = process killed (SIGKILL), usually OOM - give user-friendly guidance
                if (errorMessage.includes('exit code 137') || errorMessage.includes('Killed')) {
                    errorMessage = 'This file is too large for the server to process (it ran out of memory). Please use a smaller file, or split your data into multiple files (e.g. by month), then run POA Review on each.';
                    errorDetails = errorMessage;
                } else {
                    // Friendly hint when Python is missing pandas (venv not set up on server)
                    if (errorMessage.includes("No module named 'pandas'") || errorMessage.includes('ModuleNotFoundError')) {
                        errorDetails += '\n\nServer setup required: on the server run from project root: ./scripts/poa-review/setup-venv.sh';
                    }
                    if (error.stdout) errorDetails += `\nPython output: ${error.stdout}`;
                    if (error.stderr) errorDetails += `\nPython errors: ${error.stderr}`;
                }

                return serverError(res, `Failed to process batches: ${errorMessage}`, errorDetails);
            }
        } else {
            // Return acknowledgment that batch was received
            return ok(res, {
                success: true,
                message: 'Batch received',
                batchNumber,
                receivedBatches: batchData.receivedBatches,
                totalBatches: batchData.totalBatches,
                progress: Math.round((batchData.receivedBatches / batchData.totalBatches) * 100)
            });
        }

    } catch (error) {
        console.error('POA Review Batch API - Error:', error);
        return serverError(res, `Internal server error: ${error.message}`);
    }
}

// Clean up old batch data and their on-disk files periodically (every hour)
setInterval(() => {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
    const tempDir = path.join(rootDir, 'uploads', 'poa-review-temp');
    for (const [batchId, data] of batchStore.entries()) {
        if (data.startTime < oneHourAgo) {
            try {
                for (const p of data.batchFilePaths || []) {
                    if (p && fs.existsSync(p)) fs.unlinkSync(p);
                }
                const mergedPath = path.join(tempDir, `${batchId}_data.csv`);
                if (fs.existsSync(mergedPath)) fs.unlinkSync(mergedPath);
                deleteBatchMeta(batchId, tempDir);
            } catch (_) {}
            console.log('POA Review Batch API - Cleaning up old batch:', batchId);
            batchStore.delete(batchId);
        }
    }
}, 60 * 60 * 1000);

export default withHttp(withLogging(authRequired(handler)));

