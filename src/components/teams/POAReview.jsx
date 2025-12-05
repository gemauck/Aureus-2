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

    const handleUpload = useCallback(async () => {
        if (!uploadedFile) {
            setError('Please select a file first');
            return;
        }

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
                throw new Error('Failed to upload file');
            }

            const uploadResult = await uploadResponse.json();
            console.log('POA Review - Upload result:', uploadResult);
            
            // Validate upload result
            if (!uploadResult || !uploadResult.url) {
                throw new Error(`Upload failed: Invalid response. Expected 'url' field, got: ${JSON.stringify(uploadResult)}`);
            }
            
            setProcessingProgress('Processing data...');

            // Process the file
            // uploadResult.url is the public URL path like "/uploads/poa-review-inputs/file.xlsx"
            const processPayload = {
                filePath: uploadResult.url, // This should be "/uploads/poa-review-inputs/filename.xlsx"
                fileName: uploadedFile.name,
                sources: sources || ['Inmine: Daily Diesel Issues']
            };
            
            console.log('POA Review - Process request payload:', processPayload);
            
            const processResponse = await fetch('/api/poa-review/process', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.storage?.getToken?.() || ''}`
                },
                body: JSON.stringify(processPayload)
            });

            if (!processResponse.ok) {
                let errorMessage = 'Failed to process file';
                try {
                    const errorData = await processResponse.json();
                    errorMessage = errorData.message || errorData.error || `Server returned ${processResponse.status}: ${processResponse.statusText}`;
                    console.error('POA Review API Error:', errorData);
                } catch (parseError) {
                    const text = await processResponse.text();
                    errorMessage = text || `Server returned ${processResponse.status}: ${processResponse.statusText}`;
                    console.error('POA Review API Error (text):', text);
                }
                throw new Error(errorMessage);
            }

            setProcessingProgress('Generating report...');

            const processResult = await processResponse.json();
            
            if (processResult.downloadUrl) {
                setDownloadUrl(processResult.downloadUrl);
                setProcessingProgress('Complete!');
            } else {
                throw new Error('No download URL received');
            }

        } catch (err) {
            console.error('POA Review error:', err);
            setError(err.message || 'An error occurred while processing the file');
            setProcessingProgress('');
        } finally {
            setIsProcessing(false);
        }
    }, [uploadedFile, sources]);

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

            {/* Processing Status */}
            {isProcessing && (
                <div className={`rounded-lg border p-4 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                    <div className="flex items-center gap-3">
                        <i className="fas fa-spinner fa-spin text-indigo-600"></i>
                        <div className="flex-1">
                            <p className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-gray-900'}`}>
                                Processing...
                            </p>
                            <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                                {processingProgress}
                            </p>
                        </div>
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

