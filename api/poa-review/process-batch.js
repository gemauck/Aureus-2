/**
 * POA Review Batch Processing API Endpoint
 * 
 * Processes data in chunks to prevent server crashes with large files.
 * Accumulates results and generates final report when all batches are complete.
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

// Store batch data in memory (in production, use Redis or database)
const batchStore = new Map();

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

        // Get root directory
        const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
        const outputDir = path.join(rootDir, 'uploads', 'poa-review-outputs');
        const scriptsDir = path.join(rootDir, 'scripts', 'poa-review');
        const tempDir = path.join(rootDir, 'uploads', 'poa-review-temp');

        // Ensure directories exist
        [outputDir, scriptsDir, tempDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });

        // Initialize or get batch store
        if (!batchStore.has(batchId)) {
            batchStore.set(batchId, {
                batches: [],
                totalBatches: totalBatches || 1,
                sources: sources || ['Inmine: Daily Diesel Issues'],
                fileName: fileName || 'poa-review',
                receivedBatches: 0,
                startTime: Date.now()
            });
        }

        const batchData = batchStore.get(batchId);
        batchData.batches.push({
            batchNumber,
            rows
        });
        batchData.receivedBatches++;

        // If this is the final batch or we've received all batches, process everything
        const allBatchesReceived = isFinal || batchData.receivedBatches >= batchData.totalBatches;

        if (allBatchesReceived) {
            const totalRowsReceived = batchData.batches.reduce((sum, b) => sum + b.rows.length, 0);
            const expectedBatches = batchData.totalBatches;
            const receivedBatches = batchData.receivedBatches;
            
            console.log('POA Review Batch API - All batches received, processing...', {
                batchId,
                expectedBatches,
                receivedBatches,
                totalRowsReceived,
                isFinal,
                batchNumbers: batchData.batches.map(b => b.batchNumber).sort((a, b) => a - b)
            });
            
            // Validate we have all expected batches
            if (receivedBatches < expectedBatches && !isFinal) {
                console.warn(`POA Review Batch API - WARNING: Only received ${receivedBatches} of ${expectedBatches} batches, but processing anyway due to allBatchesReceived condition`);
            }
            
            // Check for missing batch numbers
            const batchNumbers = batchData.batches.map(b => b.batchNumber).sort((a, b) => a - b);
            const missingBatches = [];
            for (let i = 1; i <= expectedBatches; i++) {
                if (!batchNumbers.includes(i)) {
                    missingBatches.push(i);
                }
            }
            if (missingBatches.length > 0) {
                console.warn(`POA Review Batch API - WARNING: Missing batch numbers: ${missingBatches.join(', ')}`);
            }

            try {
                // Combine all batches into single array
                const sortedBatches = batchData.batches.sort((a, b) => a.batchNumber - b.batchNumber);
                const allRows = sortedBatches.flatMap(batch => batch.rows);

                console.log('POA Review Batch API - Combined rows:', allRows.length);
                console.log('POA Review Batch API - Batch count:', sortedBatches.length);
                console.log('POA Review Batch API - Expected batches:', batchData.totalBatches);
                console.log('POA Review Batch API - Rows per batch:', sortedBatches.map(b => ({ batch: b.batchNumber, rows: b.rows.length })));
                
                // Calculate total rows from all batches
                const totalRowsFromBatches = sortedBatches.reduce((sum, b) => sum + b.rows.length, 0);
                console.log('POA Review Batch API - Total rows from batches:', totalRowsFromBatches);
                console.log('POA Review Batch API - All rows array length:', allRows.length);
                
                if (totalRowsFromBatches !== allRows.length) {
                    console.error('POA Review Batch API - ERROR: Row count mismatch!', {
                        totalRowsFromBatches,
                        allRowsLength: allRows.length
                    });
                }
                
                // Validate that we have data
                if (allRows.length === 0) {
                    throw new Error('No data rows to process after combining batches');
                }

                // Create temporary CSV file for processing
                const tempCsvPath = path.join(tempDir, `${batchId}_data.csv`);
                
                // Write CSV header - preserve original column names
                if (allRows.length > 0) {
                    // Get all unique headers from all rows (in case some rows have different keys)
                    const allHeaders = new Set();
                    allRows.forEach(row => {
                        if (row && typeof row === 'object') {
                            Object.keys(row).forEach(key => {
                                // Filter out empty column names
                                const trimmed = String(key || '').trim();
                                if (trimmed && trimmed !== '' && !trimmed.match(/^Unnamed:/i)) {
                                    allHeaders.add(trimmed);
                                }
                            });
                        }
                    });
                    const headers = Array.from(allHeaders);
                    
                    // Validate we have headers
                    if (headers.length === 0) {
                        throw new Error('No valid column headers found in data rows');
                    }
                    
                    // Log headers for debugging
                    console.log('POA Review Batch API - CSV Headers:', headers);
                    console.log('POA Review Batch API - Header count:', headers.length);
                    console.log('POA Review Batch API - First row keys:', Object.keys(allRows[0]));
                    console.log('POA Review Batch API - First row sample:', JSON.stringify(allRows[0]).substring(0, 200));
                    
                    const headerRow = headers.map(h => {
                        // Escape header names if needed
                        const header = String(h || '').trim();
                        if (header.includes(',') || header.includes('"') || header.includes('\n')) {
                            return `"${header.replace(/"/g, '""')}"`;
                        }
                        return header;
                    }).join(',');
                    
                    const csvRows = allRows.map(row => {
                        return headers.map(header => {
                            const val = row[header] !== undefined ? row[header] : '';
                            // Escape commas and quotes in CSV values
                            const str = String(val || '');
                            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                                return `"${str.replace(/"/g, '""')}"`;
                            }
                            return str;
                        }).join(',');
                    });
                    
                    const csvContent = [headerRow, ...csvRows].join('\n');
                    const csvLineCount = csvContent.split('\n').length;
                    fs.writeFileSync(tempCsvPath, csvContent, 'utf8');
                    console.log('POA Review Batch API - Created temp CSV:', tempCsvPath);
                    console.log('POA Review Batch API - CSV line count (including header):', csvLineCount);
                    console.log('POA Review Batch API - CSV data rows:', csvLineCount - 1);
                    console.log('POA Review Batch API - Expected data rows:', allRows.length);
                    console.log('POA Review Batch API - CSV first line:', csvContent.split('\n')[0]);
                    
                    if (csvLineCount - 1 !== allRows.length) {
                        console.error('POA Review Batch API - ERROR: CSV row count mismatch!', {
                            csvDataRows: csvLineCount - 1,
                            expectedRows: allRows.length
                        });
                    }
                } else {
                    return badRequest(res, 'No data rows received');
                }

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
                const venvPython = path.join(rootDir, 'venv-poareview', 'bin', 'python3');
                const pythonCommand = `"${venvPython}" "${tempProcessScript}" 2>&1`;
                
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

                // Clean up temp files
                try {
                    if (fs.existsSync(tempCsvPath)) fs.unlinkSync(tempCsvPath);
                    if (fs.existsSync(tempProcessScript)) fs.unlinkSync(tempProcessScript);
                } catch (cleanupError) {
                    console.warn('POA Review Batch API - Cleanup error:', cleanupError);
                }

                // Clean up batch store
                batchStore.delete(batchId);

                // Return download URL
                const downloadUrl = `/uploads/poa-review-outputs/${outputFileName}`;
                const processingTime = ((Date.now() - batchData.startTime) / 1000).toFixed(1);

                return ok(res, {
                    success: true,
                    downloadUrl,
                    fileName: outputFileName,
                    processingTime,
                    totalRows: allRows.length
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
                batchStore.delete(batchId);
                
                // Return more detailed error information
                const errorMessage = error.message || 'Unknown error occurred';
                let errorDetails = errorMessage;
                
                // Include Python output if available
                if (error.stdout) {
                    errorDetails += `\nPython output: ${error.stdout}`;
                }
                if (error.stderr) {
                    errorDetails += `\nPython errors: ${error.stderr}`;
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

// Clean up old batch data periodically (every hour)
setInterval(() => {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    for (const [batchId, data] of batchStore.entries()) {
        if (data.startTime < oneHourAgo) {
            console.log('POA Review Batch API - Cleaning up old batch:', batchId);
            batchStore.delete(batchId);
        }
    }
}, 60 * 60 * 1000);

export default withHttp(withLogging(authRequired(handler)));

