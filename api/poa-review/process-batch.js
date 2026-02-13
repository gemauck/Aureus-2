/**
 * POA Review Batch Processing API Endpoint
 * 
 * Processes data in chunks to prevent server crashes with large files.
 * Accumulates results and generates final report when all batches are complete.
 * Enforces row limits to avoid OOM and server crash.
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { withHttp } from '../_lib/withHttp.js';
import { withLogging } from '../_lib/logger.js';
import { authRequired } from '../_lib/authRequired.js';
import { created, badRequest, serverError, ok } from '../_lib/response.js';
import { parseJsonBody } from '../_lib/body.js';

const execAsync = promisify(exec);

// Limits to prevent server crash from huge documents
const MAX_TOTAL_ROWS = 400000;   // Reject job if total rows exceed this
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

        const { batchId, batchNumber, totalBatches, rows, sources, fileName, isFinal } = payload || {};

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
                        message: `This file has too many rows (${totalRowsReceived}). Maximum ${MAX_TOTAL_ROWS} rows are supported to avoid server overload. Please split your file or use a smaller dataset.`
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
                // Merge batch CSV files in order into one file (no full dataset in memory)
                const tempCsvPath = path.join(tempDir, `${batchId}_data.csv`);
                const firstPath = batchData.batchFilePaths[0];
                if (!firstPath || !fs.existsSync(firstPath)) {
                    throw new Error('No data from batch 1. The server lost the previous batches. Please run the process again from the start (upload your file and click Process & Generate Report again).');
                }
                fs.copyFileSync(firstPath, tempCsvPath);
                for (let i = 1; i < batchData.batchFilePaths.length; i++) {
                    const p = batchData.batchFilePaths[i];
                    if (p && fs.existsSync(p)) {
                        const content = fs.readFileSync(p, 'utf8');
                        fs.appendFileSync(tempCsvPath, content, 'utf8');
                    }
                }
                console.log('POA Review Batch API - Merged temp CSV:', tempCsvPath, 'rows:', totalRowsReceived);

                // Convert CSV to Excel and process
                const timestamp = Date.now();
                const baseName = path.basename(batchData.fileName, path.extname(batchData.fileName));
                const outputFileName = `${baseName}_review_${timestamp}.xlsx`;
                const outputFilePath = path.join(outputDir, outputFileName);

                // Create Python script to process the CSV
                const tempProcessScript = path.join(scriptsDir, `process_batch_${batchId}_${timestamp}.py`);
                
                const pythonScript = `
import sys
import os
sys.path.insert(0, '${scriptsDir.replace(/\\/g, '/')}')

import pandas as pd
from FormatExcel import Formatter
from ProofReview import POAReview, format_review, review_cols

# Input and output paths
input_file = r'${tempCsvPath.replace(/\\/g, '/')}'
output_file = r'${outputFilePath.replace(/\\/g, '/')}'
sources = ${JSON.stringify(batchData.sources)}

def normalize_column_name(col_name):
    """Normalize column name for matching (case-insensitive, strip whitespace)"""
    if pd.isna(col_name):
        return None
    return str(col_name).strip().lower()

def find_column(df, target_name):
    """Find a column in the dataframe by normalized name"""
    normalized_target = normalize_column_name(target_name)
    for col in df.columns:
        if normalize_column_name(col) == normalized_target:
            return col
    return None

try:
    # Read the CSV file - don't skip rows since we already have headers
    print("Reading CSV file...")
    data = pd.read_csv(input_file, skiprows=0)
    
    print(f"Found columns: {list(data.columns)}")
    print(f"Total rows: {len(data)}")
    
    # Debug: Print first few rows to verify data structure
    if len(data) > 0:
        print(f"First row sample: {data.iloc[0].to_dict()}")
    
    # Required columns and their normalized names
    required_columns = {
        "Transaction ID": ["transaction id", "transactionid", "txn id", "txnid"],
        "Asset Number": ["asset number", "assetnumber", "asset no", "assetno"],
        "Date & Time": ["date & time", "date and time", "datetime", "date", "timestamp"]
    }
    
    # Normalize column names - map actual columns to expected names
    column_mapping = {}
    missing_columns = []
    
    for expected_col, possible_names in required_columns.items():
        found_col = None
        # Try exact match first
        if expected_col in data.columns:
            found_col = expected_col
        else:
            # Try normalized matches
            for possible_name in possible_names:
                found_col = find_column(data, possible_name)
                if found_col:
                    break
        
        if found_col:
            if found_col != expected_col:
                print(f"Mapping column '{found_col}' to '{expected_col}'")
                column_mapping[found_col] = expected_col
        else:
            missing_columns.append(expected_col)
    
    # Report missing columns
    if missing_columns:
        available_cols = ", ".join([f"'{col}'" for col in data.columns])
        error_msg = f"Missing required columns: {', '.join(missing_columns)}.\\n"
        error_msg += f"Available columns in your file: {available_cols}\\n"
        raise ValueError(error_msg)
    
    # Rename columns to match expected names
    if column_mapping:
        print(f"Renaming columns: {column_mapping}")
        data = data.rename(columns=column_mapping)
    
    print(f"Initializing review with {len(data)} rows...")
    review = POAReview(data)
    print(f"After initialization: {len(review.data)} rows")
    
    print("Marking consecutive transactions...")
    review.mark_consecutive_transactions()
    print(f"After mark_consecutive_transactions: {len(review.data)} rows")
    
    print("Creating labels for transactions...")
    review.label_rows()
    print(f"After label_rows: {len(review.data)} rows")
    
    print("Marking no POA assets...")
    review.mark_no_poa_assets()
    print(f"After mark_no_poa_assets: {len(review.data)} rows")
    
    print("Counting proof before transactions...")
    review.count_proof_before_transaction()
    print(f"After count_proof_before_transaction: {len(review.data)} rows")
    
    print("Calculating time since last activity...")
    review.time_since_last_activity()
    print(f"After time_since_last_activity: {len(review.data)} rows")
    
    print("Calculating total SMR...")
    # CRITICAL: total_smr requires 'label' column which is created by label_rows()
    # Ensure label column exists before calling total_smr
    if "label" not in review.data.columns:
        print("Warning: label column missing, recreating labels...")
        review.label_rows()
    review.total_smr(sources)
    print(f"After total_smr: {len(review.data)} rows")
    
    print(f"Before format_review: {len(review.data)} rows, {len(review.data.columns)} columns")
    print(f"Transaction rows: {review.transaction_mask.sum()}")
    print(f"Proof rows: {review.proof_mask.sum()}")
    print(f"Total rows (transaction + proof): {review.transaction_mask.sum() + review.proof_mask.sum()}")
    
    # Verify we have all rows
    if len(review.data) != len(data):
        print(f"WARNING: Row count changed during processing! Started with {len(data)}, now have {len(review.data)}")
    
    print("Formatting review...")
    # Create output directory if it doesn't exist
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    
    # Format and save - pass output_path directly
    format_review(review.data, os.path.basename(input_file), output_file)
    
    # Verify output file was created and check row count
    import openpyxl
    if os.path.exists(output_file):
        wb = openpyxl.load_workbook(output_file)
        ws = wb.active
        output_row_count = ws.max_row - 1  # Subtract header row
        print(f"Output Excel file created: {output_file}")
        print(f"Output Excel row count (excluding header): {output_row_count}")
        print(f"Input row count: {len(data)}")
        if output_row_count != len(data):
            print(f"WARNING: Row count mismatch! Input: {len(data)}, Output: {output_row_count}")
        wb.close()
    else:
        print(f"ERROR: Output file not found at {output_file}")
    
    print(f"Success! Output saved to: {output_file}")
    sys.exit(0)
except Exception as e:
    print(f"Error: {str(e)}", file=sys.stderr)
    import traceback
    traceback.print_exc(file=sys.stderr)
    sys.exit(1)
`;

                fs.writeFileSync(tempProcessScript, pythonScript);

                // Execute Python script
                console.log('POA Review Batch API - Executing Python script...');
                const pythonCommand = venvPython === 'python3'
                    ? `python3 "${tempProcessScript}" 2>&1`
                    : `"${venvPython}" "${tempProcessScript}" 2>&1`;
                
                let stdout, stderr, exitCode;
                try {
                    const result = await execAsync(pythonCommand, {
                        cwd: scriptsDir,
                        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
                        timeout: 300000 // 5 minutes timeout
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

                // Clean up temp files (merged CSV, per-batch CSVs, Python script)
                try {
                    if (fs.existsSync(tempCsvPath)) fs.unlinkSync(tempCsvPath);
                    if (fs.existsSync(tempProcessScript)) fs.unlinkSync(tempProcessScript);
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
                try {
                    for (const p of batchData?.batchFilePaths || []) {
                        if (p && fs.existsSync(p)) fs.unlinkSync(p);
                    }
                    const tempCsvPath = path.join(tempDir, `${batchId}_data.csv`);
                    if (fs.existsSync(tempCsvPath)) fs.unlinkSync(tempCsvPath);
                } catch (_) {}
                deleteBatchMeta(batchId, tempDir);
                batchStore.delete(batchId);
                
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

