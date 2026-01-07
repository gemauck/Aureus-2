// Wait for React to be available
(function() {
    // Wait for React
    function waitForReact(callback, maxAttempts = 50) {
        if (window.React && window.React.useState && window.React.useRef) {
            callback();
        } else if (maxAttempts > 0) {
            setTimeout(() => waitForReact(callback, maxAttempts - 1), 100);
        } else {
            console.error('❌ DieselRefundEvidenceEvaluator: React not available after maximum attempts');
        }
    }
    
    waitForReact(() => {
        // Get React hooks from window
        const { useState, useRef } = window.React;

        const DieselRefundEvidenceEvaluator = () => {
    const [inputData, setInputData] = useState('');
    const [evaluationResult, setEvaluationResult] = useState(null);
    const [isEvaluating, setIsEvaluating] = useState(false);
    const [error, setError] = useState(null);
    const [inputMode, setInputMode] = useState('json'); // 'json', 'text', 'file'
    const fileInputRef = useRef(null);
    const [uploadedFile, setUploadedFile] = useState(null);

    // Check if the evaluator function is available
    const evaluatorAvailable = typeof window.evaluateDieselRefundEvidence === 'function';

    const handleEvaluate = () => {
        if (!evaluatorAvailable) {
            setError('Evidence evaluator function is not loaded. Please refresh the page.');
            return;
        }

        setIsEvaluating(true);
        setError(null);
        setEvaluationResult(null);

        try {
            let dataToEvaluate;

            if (inputMode === 'file' && uploadedFile) {
                // For file mode, create a file object structure
                dataToEvaluate = {
                    fileName: uploadedFile.name,
                    fileType: uploadedFile.type,
                    fileSize: uploadedFile.size,
                    lastModified: uploadedFile.lastModified,
                    // Try to read file content if it's text-based
                    content: null
                };
            } else if (inputMode === 'json') {
                // Try to parse as JSON
                if (!inputData.trim()) {
                    throw new Error('Please enter some data to evaluate');
                }
                try {
                    dataToEvaluate = JSON.parse(inputData);
                } catch (e) {
                    throw new Error('Invalid JSON. Please check your input or use Text mode.');
                }
            } else {
                // Text mode
                if (!inputData.trim()) {
                    throw new Error('Please enter some text to evaluate');
                }
                dataToEvaluate = inputData;
            }

            // Evaluate the data
            const result = window.evaluateDieselRefundEvidence(dataToEvaluate, {
                projectId: null // Can be enhanced to accept project ID
            });

            setEvaluationResult(result);
        } catch (err) {
            setError(err.message || 'An error occurred while evaluating the data');
            console.error('Evaluation error:', err);
        } finally {
            setIsEvaluating(false);
        }
    };

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setUploadedFile(file);
            setInputData(`File: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);
            setError(null);
        }
    };

    const handleClear = () => {
        setInputData('');
        setEvaluationResult(null);
        setError(null);
        setUploadedFile(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const getScoreColor = (score) => {
        if (score >= 80) return 'text-green-600 bg-green-50';
        if (score >= 50) return 'text-yellow-600 bg-yellow-50';
        return 'text-red-600 bg-red-50';
    };

    const getScoreLabel = (score) => {
        if (score >= 80) return 'Excellent';
        if (score >= 50) return 'Good';
        return 'Needs Improvement';
    };

    if (!evaluatorAvailable) {
        return (
            <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <i className="fas fa-exclamation-triangle text-3xl text-yellow-500 mb-4"></i>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Evaluator Not Available</h3>
                <p className="text-sm text-gray-600 mb-4">
                    The diesel refund evidence evaluator function is not loaded. Please refresh the page.
                </p>
                <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                    <i className="fas fa-sync-alt mr-2"></i>
                    Refresh Page
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Diesel Refund Evidence Evaluator</h2>
                <p className="text-sm text-gray-600">
                    Evaluate any piece of data to determine if it qualifies as evidence for diesel refund claims.
                    The evaluator will classify the evidence, validate required fields, and provide recommendations.
                </p>
            </div>

            {/* Input Section */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Input Mode
                    </label>
                    <div className="flex gap-2">
                        <button
                            onClick={() => {
                                setInputMode('json');
                                setUploadedFile(null);
                                if (fileInputRef.current) fileInputRef.current.value = '';
                            }}
                            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                                inputMode === 'json'
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            <i className="fas fa-code mr-1"></i>
                            JSON
                        </button>
                        <button
                            onClick={() => {
                                setInputMode('text');
                                setUploadedFile(null);
                                if (fileInputRef.current) fileInputRef.current.value = '';
                            }}
                            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                                inputMode === 'text'
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            <i className="fas fa-file-alt mr-1"></i>
                            Text
                        </button>
                        <button
                            onClick={() => {
                                setInputMode('file');
                                setInputData('');
                            }}
                            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                                inputMode === 'file'
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            <i className="fas fa-upload mr-1"></i>
                            File
                        </button>
                    </div>
                </div>

                {inputMode === 'file' ? (
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Upload File
                        </label>
                        <input
                            ref={fileInputRef}
                            type="file"
                            onChange={handleFileSelect}
                            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                        />
                        {uploadedFile && (
                            <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600">
                                <i className="fas fa-file mr-1"></i>
                                {uploadedFile.name} ({(uploadedFile.size / 1024).toFixed(2)} KB)
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            {inputMode === 'json' ? 'JSON Data' : 'Text Data'}
                        </label>
                        <textarea
                            value={inputData}
                            onChange={(e) => setInputData(e.target.value)}
                            placeholder={
                                inputMode === 'json'
                                    ? 'Paste JSON data here...\n\nExample:\n{\n  "invoiceNumber": "INV-001",\n  "date": "2025-01-15",\n  "supplier": "ABC Fuel",\n  "amount": 125000\n}'
                                    : 'Paste or type text data here...'
                            }
                            className="w-full h-48 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono text-xs"
                        />
                    </div>
                )}

                <div className="flex gap-2">
                    <button
                        onClick={handleEvaluate}
                        disabled={isEvaluating || (!inputData.trim() && !uploadedFile)}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
                    >
                        {isEvaluating ? (
                            <>
                                <i className="fas fa-spinner fa-spin mr-2"></i>
                                Evaluating...
                            </>
                        ) : (
                            <>
                                <i className="fas fa-search mr-2"></i>
                                Evaluate Evidence
                            </>
                        )}
                    </button>
                    <button
                        onClick={handleClear}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                        <i className="fas fa-times mr-2"></i>
                        Clear
                    </button>
                </div>
            </div>

            {/* Error Display */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-start">
                        <i className="fas fa-exclamation-circle text-red-500 mt-0.5 mr-2"></i>
                        <div>
                            <h4 className="text-sm font-semibold text-red-800 mb-1">Error</h4>
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Results Section */}
            {evaluationResult && (
                <div className="space-y-4">
                    {/* Summary Card */}
                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 mb-1">Evaluation Results</h3>
                                <p className="text-sm text-gray-600">
                                    {evaluationResult.isValid ? (
                                        <span className="text-green-600">
                                            <i className="fas fa-check-circle mr-1"></i>
                                            Valid Evidence
                                        </span>
                                    ) : (
                                        <span className="text-red-600">
                                            <i className="fas fa-times-circle mr-1"></i>
                                            Invalid or Incomplete Evidence
                                        </span>
                                    )}
                                </p>
                            </div>
                            <div className={`px-4 py-2 rounded-lg ${getScoreColor(evaluationResult.relevanceScore)}`}>
                                <div className="text-xs font-medium mb-1">Relevance Score</div>
                                <div className="text-2xl font-bold">{evaluationResult.relevanceScore}%</div>
                                <div className="text-xs mt-1">{getScoreLabel(evaluationResult.relevanceScore)}</div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <div className="text-xs text-gray-600 mb-1">Evidence Type</div>
                                <div className="text-sm font-semibold text-gray-900">
                                    {evaluationResult.evidenceType || 'Unknown'}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-600 mb-1">File Category</div>
                                <div className="text-sm font-semibold text-gray-900">
                                    {evaluationResult.fileCategory || 'Unclassified'}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Criteria Card */}
                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <h4 className="text-sm font-semibold text-gray-900 mb-3">Validation Criteria</h4>
                        <div className="space-y-2">
                            {Object.entries(evaluationResult.criteria).map(([key, value]) => (
                                <div key={key} className="flex items-center justify-between text-sm">
                                    <span className="text-gray-700 capitalize">
                                        {key.replace(/([A-Z])/g, ' $1').trim()}
                                    </span>
                                    <span className={value ? 'text-green-600' : 'text-red-600'}>
                                        {value ? (
                                            <i className="fas fa-check-circle"></i>
                                        ) : (
                                            <i className="fas fa-times-circle"></i>
                                        )}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Issues Card */}
                    {evaluationResult.issues && evaluationResult.issues.length > 0 && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                            <h4 className="text-sm font-semibold text-yellow-800 mb-2 flex items-center">
                                <i className="fas fa-exclamation-triangle mr-2"></i>
                                Issues Found
                            </h4>
                            <ul className="space-y-1">
                                {evaluationResult.issues.map((issue, index) => (
                                    <li key={index} className="text-sm text-yellow-700 flex items-start">
                                        <i className="fas fa-circle text-[6px] mt-2 mr-2"></i>
                                        <span>{issue}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Recommendations Card */}
                    {evaluationResult.recommendations && evaluationResult.recommendations.length > 0 && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <h4 className="text-sm font-semibold text-blue-800 mb-2 flex items-center">
                                <i className="fas fa-lightbulb mr-2"></i>
                                Recommendations
                            </h4>
                            <ul className="space-y-1">
                                {evaluationResult.recommendations.map((rec, index) => (
                                    <li key={index} className="text-sm text-blue-700 flex items-start">
                                        <i className="fas fa-arrow-right text-[8px] mt-2 mr-2"></i>
                                        <span>{rec}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Metadata Card */}
                    {evaluationResult.metadata && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                            <h4 className="text-sm font-semibold text-gray-900 mb-3">Detected Information</h4>
                            <div className="space-y-2 text-xs">
                                {evaluationResult.metadata.detectedDates && evaluationResult.metadata.detectedDates.length > 0 && (
                                    <div>
                                        <div className="font-medium text-gray-700 mb-1">Dates:</div>
                                        <div className="text-gray-600">
                                            {evaluationResult.metadata.detectedDates.length} date(s) detected
                                        </div>
                                    </div>
                                )}
                                {evaluationResult.metadata.detectedAmounts && evaluationResult.metadata.detectedAmounts.length > 0 && (
                                    <div>
                                        <div className="font-medium text-gray-700 mb-1">Amounts:</div>
                                        <div className="text-gray-600">
                                            {evaluationResult.metadata.detectedAmounts.length} amount(s) detected
                                        </div>
                                    </div>
                                )}
                                {evaluationResult.metadata.detectedEntities && evaluationResult.metadata.detectedEntities.length > 0 && (
                                    <div>
                                        <div className="font-medium text-gray-700 mb-1">Entities:</div>
                                        <div className="text-gray-600">
                                            {evaluationResult.metadata.detectedEntities.length} entity/entities detected
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
    
        // Register component on window
        if (typeof window !== 'undefined') {
            window.DieselRefundEvidenceEvaluator = DieselRefundEvidenceEvaluator;
            console.log('✅ DieselRefundEvidenceEvaluator component registered');
        }
    });
})();

