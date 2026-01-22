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
import busboy from 'busboy/lib/index.js';

const execAsync = promisify(exec);

async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return badRequest(res, 'Method not allowed');
        }

        // Parse multipart form data
        const bb = busboy({ headers: req.headers });
        let fileBuffer = null;
        let fileName = null;
        let sources = ['Inmine: Daily Diesel Issues'];
        let fileReceived = false;

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

        await new Promise((resolve, reject) => {
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

        // Create Python script to process the Excel file directly
        const tempProcessScript = path.join(scriptsDir, `process_excel_${timestamp}.py`);
        
        const pythonScript = `
import sys
import os
sys.path.insert(0, '${scriptsDir.replace(/\\/g, '/')}')

import pandas as pd
from FormatExcel import Formatter
from ProofReview import POAReview, format_review, review_cols

# Input and output paths
input_file = r'${inputFilePath.replace(/\\/g, '/')}'
output_file = r'${outputFilePath.replace(/\\/g, '/')}'
sources = ${JSON.stringify(sources)}

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
    # Read Excel file directly using pandas (much faster than client-side parsing)
    print("Reading Excel file with pandas...")
    # Try reading with skiprows=0 first (assumes first row is header)
    data = pd.read_excel(input_file, skiprows=0)
    
    # If that doesn't work, try skiprows=1 (some files have title row)
    if len(data) == 0 or data.columns.empty:
        print("Trying with skiprows=1...")
        data = pd.read_excel(input_file, skiprows=1)
    
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
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    
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

