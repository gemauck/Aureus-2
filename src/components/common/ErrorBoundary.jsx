// Error Boundary Component - Catches React errors and shows fallback UI
const { Component } = React;

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        // Update state so the next render will show the fallback UI
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        // Enhanced error logging with detailed information
        const errorDetails = {
            message: error?.message || 'Unknown error',
            name: error?.name || 'Error',
            stack: error?.stack || 'No stack trace',
            componentStack: errorInfo?.componentStack || 'No component stack',
            errorString: error?.toString() || String(error),
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            url: window.location.href
        };
        
        console.error('🚨 ErrorBoundary caught an error:', errorDetails);
        console.error('Error object:', error);
        console.error('Error info:', errorInfo);
        
        // Log to console in a structured way for easier debugging
        if (error?.stack) {
            console.error('Error stack:', error.stack);
        }
        if (errorInfo?.componentStack) {
            console.error('Component stack:', errorInfo.componentStack);
        }
        
        this.setState({
            error: error,
            errorInfo: errorInfo
        });
    }

    render() {
        if (this.state.hasError) {
            // Fallback UI
            return (
                <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                    <div className="max-w-md w-full bg-white dark:bg-gray-800 shadow-lg rounded-lg p-6">
                        <div className="flex items-center mb-4">
                            <div className="flex-shrink-0">
                                <i className="fas fa-exclamation-triangle text-red-500 text-2xl"></i>
                            </div>
                            <div className="ml-3">
                                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                                    Something went wrong
                                </h3>
                            </div>
                        </div>
                        
                        <div className="mb-4">
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                The application encountered an unexpected error. This has been logged and will be investigated.
                            </p>
                        </div>

                        <div className="flex space-x-3">
                            <button
                                onClick={() => window.location.reload()}
                                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                            >
                                Reload Page
                            </button>
                            <button
                                onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
                                className="flex-1 bg-gray-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                            >
                                Try Again
                            </button>
                        </div>

                        {(this.state.error || this.state.errorInfo) && (
                            <details className="mt-4">
                                <summary className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                                    Error Details
                                </summary>
                                <div className="mt-2 p-3 bg-gray-100 dark:bg-gray-700 rounded-md">
                                    <pre className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                                        {this.state.error && (
                                            <>
                                                <div className="font-bold mb-2">Error:</div>
                                                <div>{this.state.error.toString()}</div>
                                                {this.state.error.stack && (
                                                    <>
                                                        <div className="font-bold mt-2 mb-2">Stack Trace:</div>
                                                        <div>{this.state.error.stack}</div>
                                                    </>
                                                )}
                                            </>
                                        )}
                                        {this.state.errorInfo?.componentStack && (
                                            <>
                                                <div className="font-bold mt-2 mb-2">Component Stack:</div>
                                                <div>{this.state.errorInfo.componentStack}</div>
                                            </>
                                        )}
                                    </pre>
                                </div>
                            </details>
                        )}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

// Make available globally
window.ErrorBoundary = ErrorBoundary;
