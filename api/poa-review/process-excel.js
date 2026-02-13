/**
 * POA Review Excel File Processing API Endpoint
 * 
 * Processes Excel files directly on the server using pandas (much faster than client-side parsing).
 * For large files (>10MB), this avoids slow client-side XLSX.js parsing.
 * Enforces file size and row limits to prevent server overload/crashes.
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { withHttp } from '../_lib/withHttp.js';
import { withLogging } from '../_lib/logger.js';
import { authRequired } from '../_lib/authRequired.js';
import { badRequest, serverError, ok } from '../_lib/response.js';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

// Limits to prevent server crash from huge documents
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB (matches UI)
const MAX_ROWS = 400000; // Reject if CSV/Excel has more rows to avoid OOM

const execAsync = promisify(exec);

async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return badRequest(res, 'Method not allowed');
        }

        // Resolve directories first so we can stream upload to disk
        const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
        const inputDir = path.join(rootDir, 'uploads', 'poa-review-inputs');
        const outputDir = path.join(rootDir, 'uploads', 'poa-review-outputs');
        const scriptsDir = path.join(rootDir, 'scripts', 'poa-review');
        [inputDir, outputDir, scriptsDir].forEach(dir => {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        });

        // Resolve Python: use venv if present, otherwise system python3
        const venvPythonPath = path.join(rootDir, 'venv-poareview', 'bin', 'python3');
        const venvPython = fs.existsSync(venvPythonPath) ? venvPythonPath : 'python3';
        if (venvPython === 'python3') {
            console.log('POA Review Excel API - venv-poareview not found, using system python3');
        }

        // Parse multipart and stream file directly to disk (no full-file buffer in memory)
        const Busboy = (await import('busboy')).default;
        const bb = Busboy({ headers: req.headers });
        let inputFilePath = null;
        let fileName = null;
        let safeFileName = '';
        let timestamp = 0;
        let sources = ['Inmine: Daily Diesel Issues'];
        let fileReceived = false;
        let writeStream = null;

        await new Promise((resolve, reject) => {
            bb.on('file', (name, file, info) => {
                const { filename } = info;
                fileName = filename;
                fileReceived = true;
                const ext = path.extname(filename).toLowerCase();
                if (!['.xlsx', '.xls'].includes(ext)) {
                    file.resume();
                    reject(new Error('Only Excel files (.xlsx, .xls) are supported'));
                    return;
                }
                timestamp = Date.now();
                safeFileName = path.basename(filename, ext).replace(/[^a-z0-9_-]/gi, '_').slice(0, 60);
                const inputFileName = `${safeFileName}_${timestamp}${ext}`;
                inputFilePath = path.join(inputDir, inputFileName);
                writeStream = createWriteStream(inputFilePath);
                let totalBytes = 0;

                file.on('data', (chunk) => {
                    totalBytes += chunk.length;
                    if (totalBytes > MAX_FILE_SIZE_BYTES) {
                        file.destroy();
                        if (writeStream) {
                            writeStream.destroy();
                            try { fs.unlinkSync(inputFilePath); } catch (_) {}
                        }
                        reject(new Error(`File too large. Maximum size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB. Upload a smaller file or split your data.`));
                        return;
                    }
                    if (writeStream && !writeStream.destroyed) writeStream.write(chunk);
                });
                file.on('end', () => {
                    if (writeStream && !writeStream.destroyed) {
                        writeStream.end();
                    }
                });
                file.on('error', (err) => {
                    if (writeStream && !writeStream.destroyed) writeStream.destroy(err);
                });
                writeStream.on('error', (err) => reject(err));
                writeStream.on('finish', () => {
                    writeStream = null;
                    streamFinished = true;
                    if (bbFinished) resolve();
                });
            });

            let bbFinished = false;
            let streamFinished = false;
            bb.on('field', (name, value) => {
                if (name === 'sources') {
                    try {
                        sources = JSON.parse(value);
                    } catch (e) { /* keep default */ }
                }
            });

            bb.on('finish', () => {
                bbFinished = true;
                if (!fileReceived || streamFinished) resolve();
            });
            bb.on('error', reject);
            req.pipe(bb);
        });

        if (!fileReceived || !inputFilePath || !fs.existsSync(inputFilePath)) {
            return badRequest(res, 'No file uploaded');
        }

        if (!fileName) {
            return badRequest(res, 'No filename provided');
        }

        const ext = path.extname(fileName).toLowerCase();
        const fileSize = fs.statSync(inputFilePath).size;
        if (fileSize > MAX_FILE_SIZE_BYTES) {
            try { fs.unlinkSync(inputFilePath); } catch (_) {}
            return res.status(413).setHeader('Content-Type', 'application/json').end(JSON.stringify({
                error: {
                    code: 'POA_FILE_TOO_LARGE',
                    message: `File too large. Maximum size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB. Upload a smaller file or split your data.`
                }
            }));
        }

        console.log('POA Review Excel API - File saved (streamed):', inputFilePath, 'Size:', fileSize, 'bytes');

        // Generate output filename
        const outputFileName = `${safeFileName}_review_${timestamp}.xlsx`;
        const outputFilePath = path.join(outputDir, outputFileName);

        // For large files, convert Excel to CSV first to avoid memory issues
        // Then use the batch processing API which handles large files efficiently
        const tempCsvPath = path.join(inputDir, `${safeFileName}_${timestamp}.csv`);
        
        // Step 1: Convert Excel to CSV using pandas (memory-efficient chunking)
        const convertScript = path.join(scriptsDir, `convert_excel_${timestamp}.py`);
        const convertScriptContent = `
import sys
import pandas as pd

input_file = r'${inputFilePath.replace(/\\/g, '/')}'
output_csv = r'${tempCsvPath.replace(/\\/g, '/')}'

try:
    print("Converting Excel to CSV (streaming for memory efficiency)...")
    
    chunk_size = 100000
    total_rows = 0
    
    # Get column count and names: first row may be merged (pandas then reports 1 col)
    print("Reading header row...")
    header_df = pd.read_excel(input_file, nrows=0)
    header_row = list(header_df.columns)
    first_data = pd.read_excel(input_file, skiprows=1, nrows=1, header=None)
    n_cols = first_data.shape[1]
    used_first_data_as_header = False
    if len(header_row) != n_cols:
        # First row may be merged; use first data row as header if it has right column count
        if first_data.shape[1] == n_cols:
            header_row = [str(first_data.iloc[0, i]) for i in range(n_cols)]
            used_first_data_as_header = True
            print(f"Using first data row as header ({n_cols} columns)")
        else:
            header_row = [str(header_row[i]) if i < len(header_row) else f'Column_{i}' for i in range(n_cols)]
            print(f"Header/data column mismatch - padded to {n_cols} columns")
    else:
        header_row = [str(h) for h in header_row]
    print(f"Using {len(header_row)} columns")
    
    # Start reading data after the header (and after first data row if we used it as header)
    skip_rows = 2 if used_first_data_as_header else 1
    
    with open(output_csv, 'w', encoding='utf-8') as csv_file:
        csv_file.write(','.join([f'"{h}"' if ',' in str(h) or '"' in str(h) else str(h) for h in header_row]) + '\\n')
        
        while True:
            print(f"Reading chunk starting at row {skip_rows}...")
            chunk = pd.read_excel(input_file, skiprows=skip_rows, nrows=chunk_size, header=None)
            
            if len(chunk) == 0:
                break
            
            # Match column count (chunk may have fewer cols on last rows or merged cells)
            n = chunk.shape[1]
            if n != len(header_row):
                use_header = list(header_row[:n]) if n <= len(header_row) else list(header_row) + [f'Column_{i}' for i in range(len(header_row), n)]
            else:
                use_header = header_row
            chunk.columns = use_header
            
            chunk.to_csv(csv_file, index=False, header=False, mode='a', lineterminator='\\n')
            total_rows += len(chunk)
            skip_rows += chunk_size
            print(f"Processed {total_rows} rows so far...")
            if len(chunk) < chunk_size:
                break
    
    print(f"Success! CSV created with {total_rows} rows")
    sys.exit(0)
    
except Exception as e:
    print(f"Error: {str(e)}", file=sys.stderr)
    import traceback
    traceback.print_exc(file=sys.stderr)
    sys.exit(1)
`;

        fs.writeFileSync(convertScript, convertScriptContent);
        
        // Execute conversion script
        console.log('POA Review Excel API - Converting Excel to CSV...');
        const convertCommand = venvPython === 'python3'
            ? `python3 "${convertScript}" 2>&1`
            : `"${venvPython}" "${convertScript}" 2>&1`;
        
        try {
            const convertResult = await execAsync(convertCommand, {
                cwd: scriptsDir,
                maxBuffer: 10 * 1024 * 1024,
                timeout: 300000 // 5 minutes
            });
            console.log('POA Review Excel API - Conversion output:', convertResult.stdout.substring(0, 500));
        } catch (convertError) {
            const errorMsg = convertError.stdout || convertError.stderr || convertError.message || '';
            const errStr = String(errorMsg).substring(0, 1000);
            console.error('POA Review Excel API - Conversion error:', errStr);
            const noSuchFile = /no such file or directory|not found|ENOENT/i.test(errStr);
            const missingPandas = /ModuleNotFoundError|No module named\s+['"]?pandas['"]?/i.test(errStr);
            const setup = 'From the project root run: ./scripts/poa-review/setup-venv.sh  (or: python3 -m venv venv-poareview && ./venv-poareview/bin/pip install pandas openpyxl)';
            if (venvPython === 'python3' && (noSuchFile || missingPandas)) {
                return serverError(res, missingPandas
                    ? `POA Review requires Python with pandas. System Python has no pandas. Create the venv: ${setup}`
                    : `POA Review requires Python with pandas. Virtual env not found. ${setup}`);
            }
            throw new Error(`Failed to convert Excel to CSV: ${errStr}`);
        }
        
        // Clean up conversion script
        if (fs.existsSync(convertScript)) {
            fs.unlinkSync(convertScript);
        }
        
        // Step 2: Process CSV directly using Python (streaming, no memory accumulation)
        // This is faster and more memory-efficient than loading CSV into Node.js memory
        console.log('POA Review Excel API - Processing CSV directly with Python...');
        
        // Use the same Python processing script as process-batch.js (reads CSV directly)
        const tempProcessScript = path.join(scriptsDir, `process_excel_csv_${timestamp}.py`);
        const pythonScript = `
import sys
import os
sys.path.insert(0, '${scriptsDir.replace(/\\/g, '/')}')

import pandas as pd
from FormatExcel import Formatter
from ProofReview import POAReview, format_review, review_cols

input_file = r'${tempCsvPath.replace(/\\/g, '/')}'
output_file = r'${outputFilePath.replace(/\\/g, '/')}'
sources = ${JSON.stringify(sources)}

# Read CSV directly (pandas is optimized for this, faster than Node.js parsing)
print("Reading CSV file...")
data = pd.read_csv(input_file, skiprows=0, low_memory=False)
print(f"Read {len(data)} rows from CSV")

MAX_ROWS = ${MAX_ROWS}
if len(data) > MAX_ROWS:
    raise ValueError(
        f"This file has too many rows ({len(data)}). "
        f"Maximum {MAX_ROWS} rows are supported to avoid server overload. "
        "Please split your file or use a smaller dataset."
    )

# Required columns check (same as process-batch.js)
required_columns = {
    "Transaction ID": ["transaction id", "transactionid", "txn id", "txnid"],
    "Asset Number": ["asset number", "assetnumber", "asset no", "assetno"],
    "Date & Time": ["date & time", "date and time", "datetime", "date", "timestamp"]
}

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
    available_cols = ", ".join([f"'{col}'" for col in data.columns])
    error_msg = f"Missing required columns: {', '.join(missing_columns)}\\\n"
    error_msg += f"Available columns: {available_cols}\\\n"
    raise ValueError(error_msg)

if column_mapping:
    data = data.rename(columns=column_mapping)

review = POAReview(data)
review.mark_consecutive_transactions()
review.label_rows()
review.mark_no_poa_assets()
review.count_proof_before_transaction()
review.time_since_last_activity()

if "label" not in review.data.columns:
    review.label_rows()
review.total_smr(sources)

os.makedirs(os.path.dirname(output_file), exist_ok=True)
format_review(review.data, os.path.basename(input_file), output_file)

print(f"Success! Output saved to: {output_file}")
sys.exit(0)
`;

        fs.writeFileSync(tempProcessScript, pythonScript);

        // Execute Python script (venvPython already set above for conversion step)
        console.log('POA Review Excel API - Executing Python script...');
        const pythonCommand = venvPython === 'python3'
            ? `python3 "${tempProcessScript}" 2>&1`
            : `"${venvPython}" "${tempProcessScript}" 2>&1`;
        
        let stdout, stderr, exitCode;
        try {
            const result = await execAsync(pythonCommand, {
                cwd: scriptsDir,
                maxBuffer: 10 * 1024 * 1024, // 10MB buffer
                timeout: 600000 // 10 minutes timeout for large files
            });
            stdout = result.stdout || '';
            stderr = result.stderr || '';
            exitCode = 0;
        } catch (execError) {
            stdout = execError.stdout || '';
            stderr = execError.stderr || '';
            exitCode = execError.code || 1;
            
            console.error('POA Review Excel API - Python execution error:', {
                message: execError.message,
                code: execError.code,
                stdout: stdout.substring(0, 2000),
                stderr: stderr.substring(0, 2000)
            });
            
            const fullError = stdout || stderr || execError.message || 'Unknown Python error';
            throw new Error(`Python script execution failed (exit code ${exitCode}):\n${fullError.substring(0, 2000)}`);
        }

        if (exitCode !== 0) {
            const fullError = [stdout, stderr].filter(Boolean).join('\n');
            throw new Error(`Python script exited with code ${exitCode}:\n${fullError.substring(0, 2000)}`);
        }

        console.log('POA Review Excel API - Python script output:', stdout.substring(0, 500));

        // Check if output file was created
        if (!fs.existsSync(outputFilePath)) {
            throw new Error(`Output file was not created. Python output: ${stdout}\nErrors: ${stderr}`);
        }

        // Clean up temp files
        try {
            if (fs.existsSync(inputFilePath)) fs.unlinkSync(inputFilePath);
            if (fs.existsSync(tempCsvPath)) fs.unlinkSync(tempCsvPath);
            if (fs.existsSync(tempProcessScript)) fs.unlinkSync(tempProcessScript);
        } catch (cleanupError) {
            console.warn('POA Review Excel API - Cleanup error:', cleanupError);
        }

        // Return download URL
        const downloadUrl = `/uploads/poa-review-outputs/${outputFileName}`;

        return ok(res, {
            success: true,
            downloadUrl,
            fileName: outputFileName
        });

    } catch (error) {
        console.error('POA Review Excel API - Error:', error);
        const msg = error.message || String(error);
        const isFileTooLarge = msg.includes('File too large') || error.code === 'POA_FILE_TOO_LARGE';
        const isTooManyRows = msg.includes('too many rows') || msg.includes('Maximum') && msg.includes('rows are supported');
        if (!res.headersSent && !res.writableEnded) {
            if (isFileTooLarge) {
                res.statusCode = 413;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                    error: { code: 'POA_FILE_TOO_LARGE', message: msg }
                }));
                return;
            }
            if (isTooManyRows) {
                res.statusCode = 413;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                    error: { code: 'POA_TOO_MANY_ROWS', message: msg }
                }));
                return;
            }
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
                error: { code: 'POA_PROCESS_ERROR', message: `Failed to process Excel file: ${msg}`, details: msg }
            }));
            return;
        }
        return serverError(res, `Failed to process Excel file: ${msg}`);
    }
}

export default withHttp(withLogging(authRequired(handler)));

