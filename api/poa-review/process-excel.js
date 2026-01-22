/**
 * POA Review Excel File Processing API Endpoint
 * 
 * Processes Excel files directly on the server using pandas (much faster than client-side parsing).
 * For large files (>10MB), this avoids slow client-side XLSX.js parsing.
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { withHttp } from '../_lib/withHttp.js';
import { withLogging } from '../_lib/logger.js';
import { authRequired } from '../_lib/authRequired.js';
import { badRequest, serverError, ok } from '../_lib/response.js';
import { createReadStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

// For busboy, we'll use a simpler approach with FormData parsing
// Since we're using FormData from the client, we can parse it directly

const execAsync = promisify(exec);

async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return badRequest(res, 'Method not allowed');
        }

        // Parse multipart form data using busboy
        const Busboy = (await import('busboy')).default;
        const bb = Busboy({ headers: req.headers });
        let fileBuffer = null;
        let fileName = null;
        let sources = ['Inmine: Daily Diesel Issues'];
        let fileReceived = false;

        await new Promise((resolve, reject) => {
            bb.on('file', (name, file, info) => {
                const { filename, encoding, mimeType } = info;
                fileName = filename;
                fileReceived = true;
                
                const chunks = [];
                file.on('data', (chunk) => {
                    chunks.push(chunk);
                });
                
                file.on('end', () => {
                    fileBuffer = Buffer.concat(chunks);
                });
            });

            bb.on('field', (name, value) => {
                if (name === 'sources') {
                    try {
                        sources = JSON.parse(value);
                    } catch (e) {
                        // Keep default sources
                    }
                }
            });

            bb.on('finish', resolve);
            bb.on('error', reject);
            req.pipe(bb);
        });

        if (!fileReceived || !fileBuffer) {
            return badRequest(res, 'No file uploaded');
        }

        if (!fileName) {
            return badRequest(res, 'No filename provided');
        }

        // Validate file type
        const ext = path.extname(fileName).toLowerCase();
        if (!['.xlsx', '.xls'].includes(ext)) {
            return badRequest(res, 'Only Excel files (.xlsx, .xls) are supported');
        }

        // Get root directory
        const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
        const inputDir = path.join(rootDir, 'uploads', 'poa-review-inputs');
        const outputDir = path.join(rootDir, 'uploads', 'poa-review-outputs');
        const scriptsDir = path.join(rootDir, 'scripts', 'poa-review');

        // Ensure directories exist
        [inputDir, outputDir, scriptsDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });

        // Save uploaded file
        const timestamp = Date.now();
        const safeFileName = path.basename(fileName, ext).replace(/[^a-z0-9_-]/gi, '_').slice(0, 60);
        const inputFileName = `${safeFileName}_${timestamp}${ext}`;
        const inputFilePath = path.join(inputDir, inputFileName);
        
        fs.writeFileSync(inputFilePath, fileBuffer);
        console.log('POA Review Excel API - File saved:', inputFilePath, 'Size:', fileBuffer.length, 'bytes');

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
    print("Converting Excel to CSV (chunked for memory efficiency)...")
    
    # Read Excel in chunks to avoid memory issues
    chunk_size = 50000  # Process 50k rows at a time
    chunks = []
    header_row = None
    
    # First, read just the header to get column names
    print("Reading header row...")
    header_df = pd.read_excel(input_file, nrows=0)
    header_row = list(header_df.columns)
    print(f"Found {len(header_row)} columns: {header_row[:5]}...")
    
    # Now read in chunks
    skip_rows = 0
    total_rows = 0
    
    while True:
        print(f"Reading chunk starting at row {skip_rows}...")
        chunk = pd.read_excel(input_file, skiprows=skip_rows, nrows=chunk_size)
        
        if len(chunk) == 0:
            break
        
        # Set column names if this is the first chunk
        if skip_rows == 0:
            chunk.columns = header_row
        
        chunks.append(chunk)
        total_rows += len(chunk)
        skip_rows += chunk_size
        
        print(f"Processed {total_rows} rows so far...")
        
        # If we got fewer rows than chunk_size, we're done
        if len(chunk) < chunk_size:
            break
    
    # Combine all chunks
    print(f"Combining {len(chunks)} chunks...")
    data = pd.concat(chunks, ignore_index=True)
    print(f"Total rows: {len(data)}")
    
    # Write to CSV
    print(f"Writing to CSV: {output_csv}")
    data.to_csv(output_csv, index=False)
    print(f"Success! CSV created with {len(data)} rows")
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
        const venvPython = path.join(rootDir, 'venv-poareview', 'bin', 'python3');
        const convertCommand = `"${venvPython}" "${convertScript}" 2>&1`;
        
        try {
            const convertResult = await execAsync(convertCommand, {
                cwd: scriptsDir,
                maxBuffer: 10 * 1024 * 1024,
                timeout: 300000 // 5 minutes
            });
            console.log('POA Review Excel API - Conversion output:', convertResult.stdout.substring(0, 500));
        } catch (convertError) {
            const errorMsg = convertError.stdout || convertError.stderr || convertError.message;
            console.error('POA Review Excel API - Conversion error:', errorMsg.substring(0, 1000));
            throw new Error(`Failed to convert Excel to CSV: ${errorMsg.substring(0, 1000)}`);
        }
        
        // Clean up conversion script
        if (fs.existsSync(convertScript)) {
            fs.unlinkSync(convertScript);
        }
        
        // Step 2: Process CSV using the same logic as process-batch.js
        // Import and reuse the batch processing logic
        const { default: processBatchCSV } = await import('./process-batch.js');
        
        // Read CSV and convert to rows array
        console.log('POA Review Excel API - Reading CSV for processing...');
        const csvContent = fs.readFileSync(tempCsvPath, 'utf8');
        const csvLines = csvContent.split('\n').filter(line => line.trim());
        
        if (csvLines.length < 2) {
            throw new Error('CSV file has no data rows');
        }
        
        // Parse header
        const headerLine = csvLines[0];
        const headers = [];
        let currentHeader = '';
        let inQuotes = false;
        
        for (let j = 0; j < headerLine.length; j++) {
            const char = headerLine[j];
            if (char === '"') {
                if (inQuotes && headerLine[j + 1] === '"') {
                    currentHeader += '"';
                    j++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                headers.push(currentHeader.trim().replace(/^"|"$/g, ''));
                currentHeader = '';
            } else {
                currentHeader += char;
            }
        }
        headers.push(currentHeader.trim().replace(/^"|"$/g, ''));
        
        // Parse data rows
        const rows = [];
        for (let i = 1; i < csvLines.length; i++) {
            const line = csvLines[i];
            const values = [];
            let current = '';
            let inQuotes = false;
            
            for (let j = 0; j < line.length; j++) {
                const char = line[j];
                if (char === '"') {
                    if (inQuotes && line[j + 1] === '"') {
                        current += '"';
                        j++;
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (char === ',' && !inQuotes) {
                    values.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
            values.push(current.trim());
            
            const row = {};
            headers.forEach((header, idx) => {
                row[header] = values[idx] || '';
            });
            rows.push(row);
        }
        
        console.log('POA Review Excel API - Parsed rows:', rows.length);
        
        // Now use batch processing - send all rows as a single "batch" but let the batch processor handle it
        // Actually, we should split into batches to avoid memory issues
        const BATCH_SIZE = 2000;
        const totalBatches = Math.ceil(rows.length / BATCH_SIZE);
        const batchId = `excel_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Store batches in the batchStore (same as process-batch.js)
        const batchStore = (await import('./process-batch.js')).batchStore || new Map();
        
        if (!batchStore.has(batchId)) {
            batchStore.set(batchId, {
                batches: [],
                totalBatches: totalBatches,
                sources: sources,
                fileName: fileName,
                receivedBatches: 0,
                startTime: Date.now()
            });
        }
        
        const batchData = batchStore.get(batchId);
        
        // Send all batches
        for (let i = 0; i < totalBatches; i++) {
            const start = i * BATCH_SIZE;
            const end = Math.min(start + BATCH_SIZE, rows.length);
            const batch = rows.slice(start, end);
            const batchNumber = i + 1;
            const isFinal = batchNumber === totalBatches;
            
            batchData.batches.push({
                batchNumber,
                rows: batch
            });
            batchData.receivedBatches++;
        }
        
        // Now trigger processing (reuse logic from process-batch.js)
        // We'll call the processing logic directly
        const allBatchesReceived = true;
        
        if (allBatchesReceived) {
            // Import the processing logic from process-batch.js
            // For now, let's just call the batch endpoint internally
            // Actually, simpler: just return the CSV path and let client handle it
            // OR: process it here using the same Python script as process-batch.js
            
            // Use the same processing approach as process-batch.js
            const sortedBatches = batchData.batches.sort((a, b) => a.batchNumber - b.batchNumber);
            const allRows = sortedBatches.flatMap(batch => batch.rows);
            
            console.log('POA Review Excel API - Processing', allRows.length, 'rows...');
            
            // Use the same Python processing script as process-batch.js
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

# Same processing logic as process-batch.js
data = pd.read_csv(input_file, skiprows=0)
print(f"Read {len(data)} rows from CSV")

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
    error_msg = f"Missing required columns: {', '.join(missing_columns)}.\\n"
    error_msg += f"Available columns: {available_cols}\\n"
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
            
            const pythonCommand = `"${venvPython}" "${tempProcessScript}" 2>&1`;
            
            let stdout, stderr, exitCode;
            try {
                const result = await execAsync(pythonCommand, {
                    cwd: scriptsDir,
                    maxBuffer: 10 * 1024 * 1024,
                    timeout: 600000 // 10 minutes
                });
                stdout = result.stdout || '';
                stderr = result.stderr || '';
                exitCode = 0;
            } catch (execError) {
                stdout = execError.stdout || '';
                stderr = execError.stderr || '';
                exitCode = execError.code || 1;
                throw new Error(`Python script failed: ${(stdout || stderr).substring(0, 2000)}`);
            }
            
            if (exitCode !== 0) {
                throw new Error(`Python script exited with code ${exitCode}`);
            }
            
            // Clean up
            try {
                if (fs.existsSync(inputFilePath)) fs.unlinkSync(inputFilePath);
                if (fs.existsSync(tempCsvPath)) fs.unlinkSync(tempCsvPath);
                if (fs.existsSync(tempProcessScript)) fs.unlinkSync(tempProcessScript);
            } catch (cleanupError) {
                console.warn('POA Review Excel API - Cleanup error:', cleanupError);
            }
            
            batchStore.delete(batchId);
            
            return ok(res, {
                success: true,
                downloadUrl: `/uploads/poa-review-outputs/${outputFileName}`,
                fileName: outputFileName
            });
        }

        fs.writeFileSync(tempProcessScript, pythonScript);

        // Execute Python script
        console.log('POA Review Excel API - Executing Python script...');
        const venvPython = path.join(rootDir, 'venv-poareview', 'bin', 'python3');
        const pythonCommand = `"${venvPython}" "${tempProcessScript}" 2>&1`;
        
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
        return serverError(res, `Failed to process Excel file: ${error.message}`);
    }
}

export default withHttp(withLogging(authRequired(handler)));

