/**
 * POA Review Component - Proof of Activity Review Tool
 * 
 * This component provides a UI for uploading fuel transaction data files
 * and downloading formatted review reports with compliance analysis.
 */

const { useState, useCallback } = React;

const POAReview = () => {
    const { isDark } = window.useTheme || (() => ({ isDark: false }));
    
    const [uploadedFile, setUploadedFile] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingProgress, setProcessingProgress] = useState('');
    const [error, setError] = useState(null);
    const [downloadUrl, setDownloadUrl] = useState(null);
    const [sources, setSources] = useState(['Inmine: Daily Diesel Issues']);
    const [newSource, setNewSource] = useState('');
    const [processingProgressPercent, setProcessingProgressPercent] = useState(0);
    const [useChunkedProcessing, setUseChunkedProcessing] = useState(true); // Default to chunked processing

    const handleFileSelect = useCallback((event) => {
        const file = event.target.files?.[0];
        if (file) {
            // Validate file type
            const validExtensions = ['.xlsx', '.xls', '.csv'];
            const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
            
            if (!validExtensions.includes(fileExtension)) {
                setError('Please upload an Excel file (.xlsx, .xls) or CSV file');
                return;
            }
            
            // Validate file size (max 50MB)
            const maxSize = 50 * 1024 * 1024; // 50MB
            if (file.size > maxSize) {
                setError('File size must be less than 50MB');
                return;
            }
            
            setUploadedFile(file);
            setError(null);
            setDownloadUrl(null);
        }
    }, []);

    // Parse Excel/CSV file client-side and convert to JSON rows
    const parseFileToRows = useCallback(async (file) => {
        const fileName = file.name.toLowerCase();
        const isCSV = fileName.endsWith('.csv');
        const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

        if (isCSV) {
            // Parse CSV
            const text = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsText(file);
            });

            const lines = text.trim().split('\n');
            if (lines.length < 2) {
                throw new Error('CSV must have at least a header row and one data row');
            }

            const headers = lines[0].split(',').map(h => h.trim());
            const rows = [];

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                // Simple CSV parsing (handles quoted fields)
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

                if (values.length === headers.length) {
                    const row = {};
                    headers.forEach((header, idx) => {
                        row[header] = values[idx] || '';
                    });
                    rows.push(row);
                }
            }

            return rows;
        } else if (isExcel) {
            // Parse Excel using XLSX.js
            let XLSXLib = window.XLSX;
            if (!XLSXLib || !XLSXLib.utils) {
                // Wait for XLSX to load
                for (let i = 0; i < 30 && (!XLSXLib || !XLSXLib.utils); i++) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    XLSXLib = window.XLSX;
                }
            }

            if (!XLSXLib || !XLSXLib.utils) {
                throw new Error('Excel file support requires xlsx library. Please refresh the page.');
            }

            const arrayBuffer = await file.arrayBuffer();
            const workbook = XLSXLib.read(arrayBuffer, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            
            // CRITICAL: Excel files often have title rows before headers
            // The Python script uses skiprows=1, meaning it skips the first row
            // We need to find the actual header row by looking for required columns
            const rawData = XLSXLib.utils.sheet_to_json(worksheet, { 
                header: 1, // Get as array of arrays
                defval: '',
                raw: false
            });
            
            if (rawData.length === 0) {
                throw new Error('Excel file appears to be empty');
            }
            
            // Find the header row by looking for required columns
            // Required columns: "Transaction ID", "Asset Number", "Date & Time"
            const requiredKeywords = ['transaction', 'asset', 'date', 'time'];
            let headerRowIndex = -1;
            let headers = [];
            
            // Check first 5 rows to find header row
            for (let i = 0; i < Math.min(5, rawData.length); i++) {
                const row = rawData[i] || [];
                const rowStr = row.join(' ').toLowerCase();
                
                // Check if this row contains required keywords
                const hasRequiredKeywords = requiredKeywords.some(keyword => 
                    rowStr.includes(keyword)
                );
                
                if (hasRequiredKeywords) {
                    headerRowIndex = i;
                    headers = row.map(h => String(h || '').trim());
                    break;
                }
            }
            
            // If no header row found, use first row (fallback)
            if (headerRowIndex === -1) {
                console.warn('POA Review - Could not find header row, using first row');
                headerRowIndex = 0;
                headers = (rawData[0] || []).map(h => String(h || '').trim());
            }
            
            // Data rows start after the header row
            const dataRows = rawData.slice(headerRowIndex + 1);
            
            // Filter out empty column headers and handle duplicates (like pandas does)
            const validHeaderIndices = [];
            const validHeaders = [];
            const headerCounts = {}; // Track how many times we've seen each header
            
            headers.forEach((header, idx) => {
                const trimmed = String(header || '').trim();
                if (trimmed && trimmed !== '' && !trimmed.match(/^Unnamed:/i)) {
                    validHeaderIndices.push(idx);
                    
                    // Handle duplicate column names like pandas does
                    // First occurrence: "Location"
                    // Second occurrence: "Location.1"
                    // Third occurrence: "Location.2", etc.
                    let finalHeader = trimmed;
                    if (headerCounts[trimmed] !== undefined) {
                        headerCounts[trimmed]++;
                        finalHeader = `${trimmed}.${headerCounts[trimmed]}`;
                    } else {
                        headerCounts[trimmed] = 0; // First occurrence, next will be .1
                    }
                    
                    validHeaders.push(finalHeader);
                }
            });
            
            if (validHeaders.length === 0) {
                throw new Error('No valid column headers found in Excel file. Please ensure the file has a header row with column names.');
            }
            
            // Convert to array of objects with proper column names (only valid columns)
            const rows = dataRows
                .filter(row => row && row.length > 0) // Filter out completely empty rows
                .map(row => {
                    const rowObj = {};
                    validHeaders.forEach((header, validIdx) => {
                        const origIdx = validHeaderIndices[validIdx];
                        rowObj[header] = row[origIdx] !== undefined ? String(row[origIdx] || '').trim() : '';
                    });
                    return rowObj;
                })
                .filter(row => {
                    // Filter out rows that are completely empty
                    return Object.values(row).some(val => val && val.trim() !== '');
                });
            
            // Log column names for debugging
            console.log('POA Review - Header row index:', headerRowIndex);
            console.log('POA Review - Parsed Excel columns (filtered):', validHeaders);
            console.log('POA Review - Total data rows:', rows.length);
            if (rows.length > 0) {
                console.log('POA Review - First row sample:', rows[0]);
            }
            
            if (rows.length === 0) {
                throw new Error('No data rows found in Excel file after parsing. Please check the file format.');
            }
            
            return rows;
        } else {
            throw new Error('Unsupported file type. Please use CSV or Excel files.');
        }
    }, []);

    // Process file in chunks using batch API
    const handleChunkedUpload = useCallback(async (rows, fileName) => {
        const BATCH_SIZE = 500; // Process 500 rows at a time
        const totalRows = rows.length;
        const totalBatches = Math.ceil(totalRows / BATCH_SIZE);
        const batchId = `poa_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        console.log('POA Review - Starting chunked upload:', {
            totalRows,
            totalBatches,
            batchId,
            fileName
        });

        setProcessingProgress(`Processing ${totalRows} rows in ${totalBatches} batches...`);
        setProcessingProgressPercent(0);

        try {
            // Send batches
            console.log('POA Review - Starting batch loop, totalBatches:', totalBatches);
            for (let i = 0; i < totalBatches; i++) {
                const start = i * BATCH_SIZE;
                const end = Math.min(start + BATCH_SIZE, totalRows);
                const batch = rows.slice(start, end);
                const batchNumber = i + 1;
                const isFinal = batchNumber === totalBatches;

                console.log(`POA Review - Sending batch ${batchNumber}/${totalBatches}`, {
                    batchSize: batch.length,
                    isFinal,
                    batchId
                });

                setProcessingProgress(`Sending batch ${batchNumber} of ${totalBatches} (${end} of ${totalRows} rows)...`);
                setProcessingProgressPercent(Math.round((batchNumber / totalBatches) * 50)); // 50% for sending

                const batchResponse = await fetch('/api/poa-review/process-batch', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${window.storage?.getToken?.() || ''}`
                    },
                    body: JSON.stringify({
                        batchId,
                        batchNumber,
                        totalBatches,
                        rows: batch,
                        sources: sources || ['Inmine: Daily Diesel Issues'],
                        fileName,
                        isFinal
                    })
                });

                if (!batchResponse.ok) {
                    // Get detailed error information
                    let errorMessage = `Failed to process batch ${batchNumber}`;
                    try {
                        const errorData = await batchResponse.json();
                        console.error('POA Review Batch API Error:', errorData);
                        errorMessage = errorData.error?.message || 
                                      errorData.message || 
                                      errorData.error || 
                                      errorMessage;
                        // Include more details if available
                        if (errorData.error?.details) {
                            errorMessage += `: ${errorData.error.details}`;
                        }
                    } catch (parseError) {
                        const errorText = await batchResponse.text().catch(() => batchResponse.statusText);
                        console.error('POA Review Batch API Error (text):', errorText);
                        errorMessage = `${errorMessage}: ${errorText || batchResponse.statusText}`;
                    }
                    throw new Error(errorMessage);
                }

                const batchResult = await batchResponse.json();
                console.log(`POA Review - Batch ${batchNumber} result:`, batchResult);

                if (isFinal) {
                    console.log('POA Review - Final batch received, checking for download URL...');
                    if (batchResult.data?.downloadUrl || batchResult.downloadUrl) {
                        // Final batch - processing complete
                        const downloadUrl = batchResult.data?.downloadUrl || batchResult.downloadUrl;
                        console.log('POA Review - Download URL received:', downloadUrl);
                        
                        setProcessingProgress('Generating final report...');
                        setProcessingProgressPercent(90);

                        // Wait a moment for server to finish processing
                        await new Promise(resolve => setTimeout(resolve, 2000));

                        // Check for final result
                        setDownloadUrl(downloadUrl);
                        setProcessingProgress('Complete!');
                        setProcessingProgressPercent(100);
                        console.log('POA Review - Processing complete, download URL set');
                        return;
                    } else {
                        console.warn('POA Review - Final batch received but no download URL:', batchResult);
                        throw new Error('Final batch processed but no download URL received. Server may still be processing.');
                    }
                } else {
                    // Update progress for non-final batches
                    const progress = batchResult.data?.progress || batchResult.progress || Math.round((batchNumber / totalBatches) * 50);
                    setProcessingProgressPercent(progress);
                    console.log(`POA Review - Batch ${batchNumber} acknowledged, progress: ${progress}%`);
                }
            }
        } catch (error) {
            console.error('POA Review - Chunked processing error:', error);
            throw error;
        }
    }, [sources]);

    // Legacy upload method (for backward compatibility)
    const handleLegacyUpload = useCallback(async () => {
        setIsProcessing(true);
        setError(null);
        setProcessingProgress('Reading file...');

        try {
            // Convert file to base64
            const reader = new FileReader();
            const fileData = await new Promise((resolve, reject) => {
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsDataURL(uploadedFile);
            });

            setProcessingProgress('Uploading file to server...');

            // Upload file to server
            const uploadResponse = await fetch('/api/files', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.storage?.getToken?.() || ''}`
                },
                body: JSON.stringify({
                    name: uploadedFile.name,
                    dataUrl: fileData,
                    folder: 'poa-review-inputs'
                })
            });

            if (!uploadResponse.ok) {
                const errorText = await uploadResponse.text();
                throw new Error(`Upload failed: ${uploadResponse.status} ${errorText}`);
            }

            const uploadResult = await uploadResponse.json();
            const uploadData = uploadResult.data || uploadResult;
            const filePath = uploadData.url || uploadData.path || uploadData.filePath;
            
            if (!filePath) {
                throw new Error(`Upload failed: Missing 'url' in response`);
            }
            
            setProcessingProgress('Processing data...');

            const processPayload = {
                filePath,
                fileName: uploadedFile.name,
                sources: sources || ['Inmine: Daily Diesel Issues']
            };
            
            const processResponse = await fetch('/api/poa-review/process', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.storage?.getToken?.() || ''}`
                },
                body: JSON.stringify(processPayload)
            });

            if (!processResponse.ok) {
                const errorData = await processResponse.json().catch(() => ({ message: processResponse.statusText }));
                throw new Error(errorData.message || 'Failed to process file');
            }

            setProcessingProgress('Generating report...');
            const processResult = await processResponse.json();
            const resultData = processResult.data || processResult;
            const downloadUrl = resultData.downloadUrl;
            
            if (downloadUrl) {
                setDownloadUrl(downloadUrl);
                setProcessingProgress('Complete!');
            } else {
                throw new Error('No download URL received from server');
            }

        } catch (err) {
            console.error('POA Review error:', err);
            setError(err.message || 'An error occurred while processing the file');
            setProcessingProgress('');
        } finally {
            setIsProcessing(false);
        }
    }, [uploadedFile, sources]);

    // Main upload handler
    const handleUpload = useCallback(async () => {
        if (!uploadedFile) {
            setError('Please select a file first');
            return;
        }

        setIsProcessing(true);
        setError(null);
        setProcessingProgressPercent(0);

        try {
            if (useChunkedProcessing) {
                // New chunked processing approach
                console.log('POA Review - Starting chunked processing mode');
                setProcessingProgress('Reading file...');
                const rows = await parseFileToRows(uploadedFile);
                
                console.log('POA Review - File parsed, rows:', rows.length);
                
                if (rows.length === 0) {
                    throw new Error('No data rows found in file');
                }

                setProcessingProgress(`Parsed ${rows.length} rows. Starting batch processing...`);
                console.log('POA Review - Calling handleChunkedUpload...');
                await handleChunkedUpload(rows, uploadedFile.name);
                console.log('POA Review - handleChunkedUpload completed');
            } else {
                // Legacy approach
                await handleLegacyUpload();
            }
        } catch (err) {
            console.error('POA Review error:', err);
            setError(err.message || 'An error occurred while processing the file');
            setProcessingProgress('');
            setProcessingProgressPercent(0);
        } finally {
            setIsProcessing(false);
        }
    }, [uploadedFile, sources, useChunkedProcessing, parseFileToRows, handleChunkedUpload, handleLegacyUpload]);

    const handleDownload = useCallback(() => {
        if (downloadUrl) {
            window.open(downloadUrl, '_blank');
        }
    }, [downloadUrl]);

    const handleAddSource = useCallback(() => {
        if (newSource.trim() && !sources.includes(newSource.trim())) {
            setSources([...sources, newSource.trim()]);
            setNewSource('');
        }
    }, [newSource, sources]);

    const handleRemoveSource = useCallback((sourceToRemove) => {
        setSources(sources.filter(s => s !== sourceToRemove));
    }, [sources]);

    return (
        <div className="space-y-4">
            {/* Header */}
            <div>
                <h3 className={`text-sm font-semibold mb-2 ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                    Proof of Activity (POA) Review
                </h3>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                    Upload fuel transaction data to generate compliance reports with proof of activity analysis
                </p>
            </div>

            {/* File Upload Section */}
            <div className={`rounded-lg border p-4 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-200' : 'text-gray-700'}`}>
                    Upload Transaction Data File
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
                    <label className="flex-1 cursor-pointer">
                        <input
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            onChange={handleFileSelect}
                            disabled={isProcessing}
                            className="hidden"
                        />
                        <div className={`border-2 border-dashed rounded-lg p-4 text-center transition ${
                            isDark 
                                ? 'border-slate-600 bg-slate-700 hover:border-slate-500' 
                                : 'border-gray-300 bg-gray-50 hover:border-gray-400'
                        } ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                            {uploadedFile ? (
                                <div>
                                    <i className={`fas fa-file-excel text-2xl mb-2 ${isDark ? 'text-green-400' : 'text-green-600'}`}></i>
                                    <p className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-gray-900'}`}>
                                        {uploadedFile.name}
                                    </p>
                                    <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                                        {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                                    </p>
                                </div>
                            ) : (
                                <div>
                                    <i className={`fas fa-cloud-upload-alt text-3xl mb-2 ${isDark ? 'text-slate-400' : 'text-gray-400'}`}></i>
                                    <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
                                        Click to select file
                                    </p>
                                    <p className={`text-xs mt-1 ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>
                                        Excel (.xlsx, .xls) or CSV files up to 50MB
                                    </p>
                                </div>
                            )}
                        </div>
                    </label>
                    {uploadedFile && !isProcessing && (
                        <button
                            onClick={() => {
                                setUploadedFile(null);
                                setDownloadUrl(null);
                                setError(null);
                            }}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                                isDark 
                                    ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' 
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            <i className="fas fa-times mr-2"></i>
                            Clear
                        </button>
                    )}
                </div>
            </div>

            {/* Sources Configuration */}
            <div className={`rounded-lg border p-4 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-200' : 'text-gray-700'}`}>
                    SMR Sources to Include
                </label>
                <p className={`text-xs mb-3 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                    Specify which sources to include when calculating total SMR usage
                </p>
                
                <div className="flex flex-col sm:flex-row gap-2 mb-3">
                    <input
                        type="text"
                        value={newSource}
                        onChange={(e) => setNewSource(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddSource()}
                        placeholder="Enter source name (e.g., 'Inmine: Daily Diesel Issues')"
                        className={`flex-1 px-3 py-2 text-sm border rounded-lg ${
                            isDark 
                                ? 'bg-slate-700 border-slate-600 text-slate-100' 
                                : 'bg-white border-gray-300'
                        }`}
                    />
                    <button
                        onClick={handleAddSource}
                        disabled={!newSource.trim()}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                            newSource.trim()
                                ? isDark 
                                    ? 'bg-indigo-600 text-white hover:bg-indigo-700' 
                                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                : isDark
                                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                    >
                        <i className="fas fa-plus mr-2"></i>
                        Add
                    </button>
                </div>

                {sources.length > 0 && (
                    <div className="space-y-2">
                        {sources.map((source, index) => (
                            <div
                                key={index}
                                className={`flex items-center justify-between p-2 rounded ${
                                    isDark ? 'bg-slate-700' : 'bg-gray-50'
                                }`}
                            >
                                <span className={`text-sm ${isDark ? 'text-slate-200' : 'text-gray-700'}`}>
                                    {source}
                                </span>
                                <button
                                    onClick={() => handleRemoveSource(source)}
                                    className={`p-1 rounded transition ${
                                        isDark 
                                            ? 'text-slate-400 hover:text-red-400 hover:bg-slate-600' 
                                            : 'text-gray-400 hover:text-red-600 hover:bg-gray-200'
                                    }`}
                                >
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Error Display */}
            {error && (
                <div className={`rounded-lg border p-3 ${isDark ? 'bg-red-900/30 border-red-700 text-red-200' : 'bg-red-50 border-red-200 text-red-800'}`}>
                    <div className="flex items-center gap-2">
                        <i className="fas fa-exclamation-circle"></i>
                        <span className="text-sm">{error}</span>
                    </div>
                </div>
            )}

            {/* Processing Mode Toggle */}
            <div className={`rounded-lg border p-3 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                <div className="flex items-center justify-between">
                    <div>
                        <label className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-gray-700'}`}>
                            Processing Mode
                        </label>
                        <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                            {useChunkedProcessing 
                                ? 'Chunked processing (recommended for large files)' 
                                : 'Legacy processing (may cause server issues with large files)'}
                        </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={useChunkedProcessing}
                            onChange={(e) => setUseChunkedProcessing(e.target.checked)}
                            disabled={isProcessing}
                            className="sr-only peer"
                        />
                        <div className={`w-11 h-6 rounded-full peer ${
                            useChunkedProcessing 
                                ? 'bg-indigo-600' 
                                : 'bg-gray-300'
                        } peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${isDark ? 'peer-checked:bg-indigo-600' : ''}`}></div>
                    </label>
                </div>
            </div>

            {/* Processing Status */}
            {isProcessing && (
                <div className={`rounded-lg border p-4 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                    <div className="flex items-center gap-3 mb-3">
                        <i className="fas fa-spinner fa-spin text-indigo-600"></i>
                        <div className="flex-1">
                            <p className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-gray-900'}`}>
                                Processing...
                            </p>
                            <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                                {processingProgress}
                            </p>
                        </div>
                        <span className={`text-xs font-medium ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                            {processingProgressPercent}%
                        </span>
                    </div>
                    {/* Progress Bar */}
                    <div className={`w-full h-2 rounded-full ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`}>
                        <div 
                            className="h-2 rounded-full bg-indigo-600 transition-all duration-300"
                            style={{ width: `${processingProgressPercent}%` }}
                        ></div>
                    </div>
                </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
                <button
                    onClick={handleUpload}
                    disabled={!uploadedFile || isProcessing}
                    className={`flex-1 px-4 py-3 rounded-lg text-sm font-medium transition ${
                        uploadedFile && !isProcessing
                            ? isDark
                                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                : 'bg-indigo-600 text-white hover:bg-indigo-700'
                            : isDark
                                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                >
                    {isProcessing ? (
                        <>
                            <i className="fas fa-spinner fa-spin mr-2"></i>
                            Processing...
                        </>
                    ) : (
                        <>
                            <i className="fas fa-play mr-2"></i>
                            Process & Generate Report
                        </>
                    )}
                </button>

                {downloadUrl && (
                    <button
                        onClick={handleDownload}
                        className={`px-4 py-3 rounded-lg text-sm font-medium transition ${
                            isDark
                                ? 'bg-green-600 text-white hover:bg-green-700'
                                : 'bg-green-600 text-white hover:bg-green-700'
                        }`}
                    >
                        <i className="fas fa-download mr-2"></i>
                        Download Report
                    </button>
                )}
            </div>

            {/* Info Section */}
            <div className={`rounded-lg border p-4 ${isDark ? 'bg-blue-900/30 border-blue-700' : 'bg-blue-50 border-blue-200'}`}>
                <h4 className={`text-sm font-semibold mb-2 ${isDark ? 'text-blue-200' : 'text-blue-900'}`}>
                    <i className="fas fa-info-circle mr-2"></i>
                    About POA Review
                </h4>
                <ul className={`text-xs space-y-1 ${isDark ? 'text-blue-200' : 'text-blue-800'}`}>
                    <li>• Analyzes fuel transaction data and proof of activity records</li>
                    <li>• Identifies assets with missing proof records (non-compliant)</li>
                    <li>• Groups consecutive transactions within 1 hour</li>
                    <li>• Calculates time gaps between proof records and transactions</li>
                    <li>• Generates formatted Excel reports with conditional formatting</li>
                </ul>
            </div>
        </div>
    );
};

// Make available globally
window.POAReview = POAReview;

// Dispatch event to notify other components
try {
    window.dispatchEvent(new CustomEvent('componentLoaded', { 
        detail: { component: 'POAReview' } 
    }));
    console.log('✅ POAReview component registered and event dispatched');
} catch (error) {
    console.warn('⚠️ Failed to dispatch componentLoaded event:', error);
}

