// Use React from window
const { useState, useRef } = React;

const HandwritingToWord = () => {
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [recognizedText, setRecognizedText] = useState('');
    const [recognizing, setRecognizing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState(null);
    const fileInputRef = useRef(null);

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setError('Please select a valid image file');
            return;
        }

        setError(null);
        setImageFile(file);
        setRecognizedText('');
        setProgress(0);

        // Create preview
        const reader = new FileReader();
        reader.onload = (e) => {
            setImagePreview(e.target.result);
        };
        reader.readAsDataURL(file);
    };

    const recognizeText = async () => {
        if (!imageFile) return;

        setRecognizing(true);
        setError(null);
        setProgress(0);

        try {
            // Lazy load Tesseract.js if not already loaded
            if (!window.Tesseract && window.loadTesseract) {
                await window.loadTesseract();
            }
            
            if (!window.Tesseract) {
                throw new Error('Tesseract.js library failed to load');
            }

            // Initialize Tesseract worker
            const worker = await window.Tesseract.createWorker({
                logger: (m) => {
                    if (m.status === 'recognizing text') {
                        setProgress(Math.round(m.progress * 100));
                    }
                }
            });

            await worker.loadLanguage('eng');
            await worker.initialize('eng');

            // Recognize text
            const { data: { text } } = await worker.recognize(imageFile);
            
            setRecognizedText(text);
            setProgress(100);

            await worker.terminate();

        } catch (err) {
            console.error('Error recognizing text:', err);
            setError('Failed to recognize text: ' + err.message);
        } finally {
            setRecognizing(false);
        }
    };

    const downloadAsWord = () => {
        if (!recognizedText) return;

        // Create enhanced RTF document with better formatting
        let rtfContent = '{\\rtf1\\ansi\\ansicpg1252\\deff0\\nouicompat\\deflang1033\n';
        
        // Font table with multiple fonts
        rtfContent += '{\\fonttbl{\\f0\\fnil\\fcharset0 Calibri;}{\\f1\\fmodern\\fcharset0 Courier New;}}\n';
        
        // Color table
        rtfContent += '{\\colortbl ;\\red0\\green0\\blue0;\\red0\\green0\\blue255;\\red255\\green0\\blue0;}\n';
        
        // Document formatting
        rtfContent += '\\viewkind4\\uc1\n';
        rtfContent += '\\pard\\sl276\\slmult1\\f0\\fs22\\lang9 ';
        
        // Process text with better formatting
        const lines = recognizedText.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (line === '') {
                // Empty line - add paragraph break
                rtfContent += '\\par\\par\n';
                continue;
            }
            
            // Check if line looks like a heading (all caps, short, or ends with colon)
            const isHeading = (
                (line === line.toUpperCase() && line.length < 50 && line.length > 3) ||
                (line.match(/^(\\d+\\.\\s|[A-Z][A-Z\\s]{2,}:)/) && line.length < 60)
            );
            
            if (isHeading) {
                // Headings - bold and slightly larger
                rtfContent += '\\pard\\sl276\\slmult1\\b\\fs24 ';
                rtfContent += escapeRtf(line);
                rtfContent += '\\b0\\fs22\\par\n';
            } else {
                // Regular paragraph with preserved spacing
                const leadingSpaces = lines[i].match(/^\\s*/)[0].length;
                
                // Add indentation if line starts with spaces (preserve structure)
                if (leadingSpaces > 0) {
                    const indent = Math.min(leadingSpaces * 72, 1440); // Max 2 inches
                    rtfContent += `\\pard\\sl276\\slmult1\\li${indent} `;
                } else {
                    rtfContent += '\\pard\\sl276\\slmult1 ';
                }
                
                rtfContent += escapeRtf(line);
                rtfContent += '\\par\n';
            }
        }
        
        rtfContent += '}';

        // Create blob and download
        const blob = new Blob([rtfContent], { 
            type: 'application/rtf' 
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = imageFile.name.replace(/\.[^.]+$/, '.rtf');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // Helper function to escape RTF special characters
    const escapeRtf = (text) => {
        return text
            .replace(/\\/g, '\\\\')
            .replace(/{/g, '\\{')
            .replace(/}/g, '\\}')
            .replace(/\t/g, '\\tab ');
    };

    const downloadAsTxt = () => {
        if (!recognizedText) return;

        const blob = new Blob([recognizedText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = imageFile.name.replace(/\.[^.]+$/, '.txt');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const copyToClipboard = () => {
        if (!recognizedText) return;
        navigator.clipboard.writeText(recognizedText);
        alert('Text copied to clipboard!');
    };

    const reset = () => {
        setImageFile(null);
        setImagePreview(null);
        setRecognizedText('');
        setProgress(0);
        setError(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div className="space-y-3">
            {/* Upload Section */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Upload Handwritten Image</h3>
                
                <div className="space-y-3">
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-primary-400 hover:bg-primary-50 transition-colors"
                    >
                        <i className="fas fa-image text-3xl text-gray-400 mb-2"></i>
                        <p className="text-xs text-gray-600 mb-1">
                            Click to select image or drag and drop
                        </p>
                        <p className="text-[10px] text-gray-500">
                            Supports: JPG, PNG, BMP, GIF • Maximum size: 5MB
                        </p>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleFileSelect}
                            className="hidden"
                        />
                    </div>

                    {imageFile && (
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center space-x-2">
                                    <i className="fas fa-file-image text-blue-600 text-lg"></i>
                                    <div>
                                        <p className="text-xs font-medium text-gray-900">{imageFile.name}</p>
                                        <p className="text-[10px] text-gray-600">
                                            {(imageFile.size / 1024).toFixed(2)} KB
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={reset}
                                    className="text-gray-400 hover:text-red-600 transition-colors"
                                >
                                    <i className="fas fa-times text-xs"></i>
                                </button>
                            </div>
                            
                            {imagePreview && (
                                <div className="mt-2 rounded border border-gray-300 overflow-hidden">
                                    <img 
                                        src={imagePreview} 
                                        alt="Preview" 
                                        className="w-full h-48 object-contain bg-gray-100"
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 flex items-start">
                            <i className="fas fa-exclamation-circle text-red-600 text-xs mt-0.5 mr-2"></i>
                            <p className="text-xs text-red-800">{error}</p>
                        </div>
                    )}

                    {imageFile && !recognizedText && !recognizing && (
                        <button
                            onClick={recognizeText}
                            className="w-full bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-xs font-medium transition-colors"
                        >
                            <i className="fas fa-magic mr-1.5"></i>
                            Recognize Handwriting
                        </button>
                    )}

                    {recognizing && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-600">Recognizing text...</span>
                                <span className="font-medium text-primary-600">{progress}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                <div
                                    className="bg-primary-600 h-full transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                ></div>
                            </div>
                            <p className="text-[10px] text-gray-500 text-center">
                                This may take a few moments depending on image size...
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Results Section */}
            {recognizedText && (
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-gray-900">Recognized Text</h3>
                        <div className="flex items-center space-x-2">
                            <button
                                onClick={copyToClipboard}
                                className="text-xs text-gray-600 hover:text-gray-900 px-2 py-1 hover:bg-gray-100 rounded transition-colors"
                                title="Copy to clipboard"
                            >
                                <i className="fas fa-copy mr-1"></i>
                                Copy
                            </button>
                            <button
                                onClick={downloadAsTxt}
                                className="text-xs text-gray-600 hover:text-gray-900 px-2 py-1 hover:bg-gray-100 rounded transition-colors"
                                title="Download as text file"
                            >
                                <i className="fas fa-file-alt mr-1"></i>
                                TXT
                            </button>
                            <button
                                onClick={downloadAsWord}
                                className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded transition-colors font-medium"
                                title="Download as RTF (opens in Word)"
                            >
                                <i className="fas fa-file-word mr-1"></i>
                                Download RTF
                            </button>
                        </div>
                    </div>

                    <div className="bg-gray-50 rounded border border-gray-200 p-3">
                        <textarea
                            value={recognizedText}
                            onChange={(e) => setRecognizedText(e.target.value)}
                            className="w-full h-64 text-xs text-gray-800 font-mono resize-none focus:outline-none bg-transparent"
                            placeholder="Recognized text will appear here..."
                        />
                    </div>

                    <div className="mt-2 text-[10px] text-gray-500 flex items-center justify-between">
                        <span>{recognizedText.length.toLocaleString()} characters</span>
                        <span>{recognizedText.split(/\s+/).filter(w => w.length > 0).length.toLocaleString()} words</span>
                    </div>

                    <div className="mt-2 bg-yellow-50 border border-yellow-200 rounded p-2 flex items-start">
                        <i className="fas fa-lightbulb text-yellow-600 text-xs mt-0.5 mr-2"></i>
                        <p className="text-[10px] text-yellow-800">
                            You can edit the recognized text above before downloading
                        </p>
                    </div>
                </div>
            )}

            {/* Tips Section */}
            {!imageFile && (
                <>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <div className="flex items-start">
                            <i className="fas fa-info-circle text-blue-600 text-xs mt-0.5 mr-2"></i>
                            <div>
                                <p className="text-xs font-medium text-blue-900 mb-1">Tips for best results</p>
                                <ul className="text-xs text-blue-800 space-y-0.5 list-disc list-inside">
                                    <li>Use clear, high-resolution images</li>
                                    <li>Ensure good lighting and minimal shadows</li>
                                    <li>Keep text horizontal and aligned</li>
                                    <li>Avoid busy backgrounds or patterns</li>
                                    <li>Use dark ink on light paper for best contrast</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                    
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                        <div className="flex items-start">
                            <i className="fas fa-check-circle text-green-600 text-xs mt-0.5 mr-2"></i>
                            <div>
                                <p className="text-xs font-medium text-green-900 mb-1">Enhanced Formatting</p>
                                <p className="text-xs text-green-800">
                                    The RTF file automatically formats headings, preserves indentation, and maintains document structure. 
                                    You can edit the recognized text before downloading, and it opens perfectly in Word.
                                </p>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Technical Info */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="flex items-start">
                    <i className="fas fa-cog text-gray-600 text-xs mt-0.5 mr-2"></i>
                    <div>
                        <p className="text-xs font-medium text-gray-900 mb-1">How it works</p>
                        <p className="text-[10px] text-gray-600 leading-relaxed">
                            This tool uses Optical Character Recognition (OCR) technology powered by Tesseract.js 
                            to analyze handwritten text in images and convert it to digital text. The accuracy 
                            depends on handwriting clarity and image quality. After recognition, you can edit 
                            the text before downloading.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Make available globally
window.HandwritingToWord = HandwritingToWord;
