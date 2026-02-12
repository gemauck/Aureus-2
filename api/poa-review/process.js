/**
 * POA Review Processing API Endpoint
 * 
 * Processes uploaded Excel/CSV files using the Python POA Review scripts
 * and returns a download URL for the generated report.
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { withHttp } from '../_lib/withHttp.js';
import { withLogging } from '../_lib/logger.js';
import { authRequired } from '../_lib/authRequired.js';
import { created, badRequest, serverError } from '../_lib/response.js';
import { parseJsonBody } from '../_lib/body.js';

const execAsync = promisify(exec);

async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return badRequest(res, 'Method not allowed');
        }

        let payload;
        try {
            payload = await parseJsonBody(req);
        } catch (parseError) {
            console.error('POA Review API - JSON parse error:', parseError);
            return badRequest(res, `Invalid JSON payload: ${parseError.message}`);
        }

        const { filePath, fileName, sources } = payload || {};

        console.log('POA Review API - Received payload:', { filePath, fileName, sources });

        if (!filePath || !fileName) {
            console.error('POA Review API - Missing required fields:', { filePath: !!filePath, fileName: !!fileName });
            return badRequest(res, 'filePath and fileName are required');
        }

        // Get root directory - same resolution as files.js
        // files.js uses: path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
        // Since we're in api/poa-review/, we need to go up two levels
        const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
        console.log('POA Review API - Root directory:', rootDir);
        console.log('POA Review API - Current file location:', new URL(import.meta.url).pathname);
        
        // Setup directories
        const inputDir = path.join(rootDir, 'uploads', 'poa-review-inputs');
        const outputDir = path.join(rootDir, 'uploads', 'poa-review-outputs');
        const scriptsDir = path.join(rootDir, 'scripts', 'poa-review');
        
        console.log('POA Review API - Directories:', { inputDir, outputDir, scriptsDir });
        
        // Ensure directories exist
        [inputDir, outputDir, scriptsDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log('POA Review API - Created directory:', dir);
            }
        });

        // Resolve file paths - handle both absolute and relative paths
        let inputFilePath;
        if (filePath.startsWith('/')) {
            // Absolute path from root (e.g., /uploads/poa-review-inputs/file.xlsx)
            inputFilePath = path.join(rootDir, filePath.slice(1));
        } else {
            // Relative path
            inputFilePath = path.join(rootDir, filePath);
        }
        
        console.log('POA Review API - Resolved input file path:', inputFilePath);
        console.log('POA Review API - File exists:', fs.existsSync(inputFilePath));
        
        if (!fs.existsSync(inputFilePath)) {
            console.error('POA Review API - File not found at:', inputFilePath);
            // List files in the input directory for debugging
            if (fs.existsSync(inputDir)) {
                const files = fs.readdirSync(inputDir);
                console.log('POA Review API - Files in input directory:', files);
            }
            return badRequest(res, `Uploaded file not found at: ${inputFilePath}`);
        }

        // Generate output filename
        const baseName = path.basename(fileName, path.extname(fileName));
        const timestamp = Date.now();
        const outputFileName = `${baseName}_review_${timestamp}.xlsx`;
        const outputFilePath = path.join(outputDir, outputFileName);

        // Copy Python scripts to scripts directory if they don't exist
        const formatExcelScript = path.join(scriptsDir, 'FormatExcel.py');
        const proofReviewScript = path.join(scriptsDir, 'ProofReview.py');

        // Check if scripts exist, if not, create them
        if (!fs.existsSync(formatExcelScript)) {
            // Create FormatExcel.py (you'll need to copy the actual content)
            // For now, we'll assume scripts are already in place
            console.warn('FormatExcel.py not found, please ensure scripts are in place');
        }

        // Create a temporary processing script that uses the uploaded file
        const tempProcessScript = path.join(scriptsDir, `process_${timestamp}.py`);
        
        // Create a Python script that processes the single file
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
sources = ${JSON.stringify(sources || ['Inmine: Daily Diesel Issues'])}

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
    # Read the Excel file
    print("Reading file...")
    data = pd.read_excel(input_file, skiprows=1)
    
    print(f"Found columns: {list(data.columns)}")
    
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
        error_msg += "Please ensure your Excel file contains columns with names matching (case-insensitive):\\n"
        for col in missing_columns:
            error_msg += f"  - {col}\\n"
        raise ValueError(error_msg)
    
    # Rename columns to match expected names
    if column_mapping:
        print(f"Renaming columns: {column_mapping}")
        data = data.rename(columns=column_mapping)
    
    print("Initializing review...")
    review = POAReview(data)
    
    print("Marking no POA assets...")
    review.mark_no_poa_assets()
    
    print("Calculating time since last activity...")
    review.time_since_last_activity()
    
    print("Calculating total SMR...")
    review.total_smr(sources)
    
    print("Formatting review...")
    # Create output directory if it doesn't exist
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    
    # Format and save - pass output_path directly
    format_review(review.data, os.path.basename(input_file), output_file)
    
    print(f"Success! Output saved to: {output_file}")
    sys.exit(0)
except Exception as e:
    print(f"Error: {str(e)}", file=sys.stderr)
    import traceback
    traceback.print_exc(file=sys.stderr)
    sys.exit(1)
`;

        fs.writeFileSync(tempProcessScript, pythonScript);

        // Resolve Python: use venv if present, otherwise system python3
        const venvPythonPath = path.join(rootDir, 'venv-poareview', 'bin', 'python3');
        const venvPython = fs.existsSync(venvPythonPath) ? venvPythonPath : 'python3';
        if (venvPython === 'python3') {
            console.log('POA Review process API - venv-poareview not found, using system python3');
        }

        // Execute Python script
        console.log('Executing Python script...');
        const pythonCommand = venvPython === 'python3'
            ? `python3 "${tempProcessScript}" 2>&1`
            : `"${venvPython}" "${tempProcessScript}" 2>&1`;
        console.log('Python command:', pythonCommand);
        console.log('Working directory:', scriptsDir);
        
        let stdout, stderr;
        try {
            const result = await execAsync(pythonCommand, {
                cwd: scriptsDir,
                maxBuffer: 10 * 1024 * 1024, // 10MB buffer
                timeout: 300000 // 5 minute timeout
            });
            stdout = result.stdout;
            stderr = result.stderr;
        } catch (execError) {
            console.error('Python execution error:', execError);
            // When Python script exits with non-zero code, execAsync throws an error
            // The output is usually in execError.stdout (because we use 2>&1)
            stdout = execError.stdout || '';
            stderr = execError.stderr || '';
            
            // Combine stdout and stderr for error detection (2>&1 redirects stderr to stdout)
            const combinedErrorOutput = (stdout || '') + (stderr || '');
            
            // Extract user-friendly error message
            let errorMessage = 'Python script execution failed';
            if (combinedErrorOutput.includes('KeyError')) {
                const keyErrorMatch = combinedErrorOutput.match(/KeyError:\s*['"]([^'"]+)['"]/);
                if (keyErrorMatch) {
                    errorMessage = `Missing required column in Excel file: "${keyErrorMatch[1]}". Please ensure your file contains all required columns.`;
                } else {
                    errorMessage = 'Missing required column in Excel file. Please check the file structure.';
                }
            } else if (combinedErrorOutput.includes('Error:')) {
                const errorMatch = combinedErrorOutput.match(/Error:\s*(.+?)(?:\n|Traceback|$)/s);
                if (errorMatch) {
                    errorMessage = errorMatch[1].trim();
                }
            } else if (execError.message) {
                errorMessage = execError.message;
            }
            
            // Log the full error for debugging
            console.error('Python script error details:', {
                stdout,
                stderr,
                message: execError.message,
                code: execError.code
            });
            
            throw new Error(errorMessage);
        }

        console.log('Python stdout:', stdout);
        if (stderr) {
            console.warn('Python stderr:', stderr);
        }
        
        // Check if Python script exited with error
        // Check both stdout and stderr for errors (Python errors can go to either)
        const combinedOutput = (stdout || '') + (stderr || '');
        if (combinedOutput.includes('Error:') || combinedOutput.includes('Traceback') || combinedOutput.includes('KeyError')) {
            // Extract a more user-friendly error message
            let errorMessage = 'Python script error occurred';
            if (combinedOutput.includes('KeyError')) {
                const keyErrorMatch = combinedOutput.match(/KeyError:\s*['"]([^'"]+)['"]/);
                if (keyErrorMatch) {
                    errorMessage = `Missing required column in Excel file: "${keyErrorMatch[1]}". Please ensure your file contains all required columns.`;
                } else {
                    errorMessage = 'Missing required column in Excel file. Please check the file structure.';
                }
            } else if (combinedOutput.includes('Error:') || combinedOutput.includes('ValueError')) {
                // Try to extract the full error message including available columns
                // Look for "Error:" or "ValueError:" followed by the message (may span multiple lines until Traceback)
                // Use dotall flag equivalent by using [\s\S] instead of .
                const errorMatch = combinedOutput.match(/(?:Error|ValueError):\s*([\s\S]+?)(?:\nTraceback|$)/);
                if (errorMatch) {
                    // Clean up the error message - remove extra whitespace but preserve structure
                    errorMessage = errorMatch[1]
                        .replace(/\\n/g, '\n') // Convert \n escape sequences to actual newlines
                        .replace(/\n\s*\n\s*\n/g, '\n\n') // Collapse multiple blank lines to double newline
                        .trim();
                } else {
                    // Fallback: try simpler pattern for single-line errors
                    const simpleMatch = combinedOutput.match(/Error:\s*([^\n]+)/);
                    if (simpleMatch) {
                        errorMessage = simpleMatch[1].trim();
                    }
                }
            }
            throw new Error(errorMessage);
        }
        
        // Also check if stdout indicates failure
        if (stdout && stdout.includes('Error:')) {
            const errorMatch = stdout.match(/Error:\s*(.+?)(?:\n|$)/);
            if (errorMatch) {
                throw new Error(errorMatch[1].trim());
            }
        }

        // Clean up temp script
        if (fs.existsSync(tempProcessScript)) {
            fs.unlinkSync(tempProcessScript);
        }

        // Check if output file was created
        if (!fs.existsSync(outputFilePath)) {
            return serverError(res, 'Failed to generate output file. Check server logs for details.');
        }

        // Return download URL
        const downloadUrl = `/uploads/poa-review-outputs/${outputFileName}`;
        
        return created(res, {
            success: true,
            downloadUrl,
            fileName: outputFileName,
            message: 'File processed successfully'
        });

    } catch (error) {
        console.error('POA Review processing error:', error);
        return serverError(res, 'Processing failed', error.message);
    }
}

export default withHttp(withLogging(authRequired(handler)));

