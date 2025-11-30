/**
 * API Retry Utility
 * Automatically retries API calls that fail due to connection errors
 * 
 * Usage:
 * const result = await retryApiCall(() => window.api.getContacts(clientId), 3, 1000);
 */

/**
 * Retry an API call with exponential backoff
 * @param {Function} apiCall - The API function to call (should return a Promise)
 * @param {number} maxRetries - Maximum number of retry attempts (default: 3)
 * @param {number} initialDelay - Initial delay between retries in ms (default: 1000)
 * @returns {Promise<any>} - The result of the successful API call
 * @throws {Error} - The last error if all retries fail
 */
export async function retryApiCall(apiCall, maxRetries = 3, initialDelay = 1000) {
    let lastError;
    let delay = initialDelay;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await apiCall();
            
            if (attempt > 1) {
            }
            
            return result;
        } catch (error) {
            lastError = error;
            
            // Only retry on connection/network errors
            const isRetryableError = 
                error.message?.includes('Failed to fetch') ||
                error.message?.includes('ERR_CONNECTION_REFUSED') ||
                error.message?.includes('ECONNREFUSED') ||
                error.message?.includes('Network request failed') ||
                error.message?.includes('fetch') ||
                error.name === 'TypeError' && error.message?.includes('fetch');
            
            
            if (!isRetryableError) {
                // Don't retry non-connection errors (auth errors, validation errors, etc.)
                console.error(`❌ Non-retryable error (${error.message}), aborting`);
                throw error;
            }
            
            if (attempt < maxRetries) {
                console.warn(`⏳ Retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                // Exponential backoff: double the delay for next retry
                delay *= 2;
            } else {
                console.error(`❌ All ${maxRetries} retry attempts exhausted`);
                throw new Error(`API call failed after ${maxRetries} attempts: ${lastError.message}`);
            }
        }
    }
    
    // This should never be reached, but TypeScript/ESLint likes it
    throw lastError;
}

/**
 * Retry an API call with a custom retry strategy
 * @param {Function} apiCall - The API function to call
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum retries (default: 3)
 * @param {number} options.initialDelay - Initial delay in ms (default: 1000)
 * @param {number} options.maxDelay - Maximum delay in ms (default: 30000)
 * @param {Function} options.shouldRetry - Custom function to determine if error should be retried
 * @returns {Promise<any>}
 */
export async function retryApiCallWithOptions(apiCall, options = {}) {
    const {
        maxRetries = 3,
        initialDelay = 1000,
        maxDelay = 30000,
        shouldRetry = null
    } = options;
    
    let lastError;
    let delay = initialDelay;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await apiCall();
            
            if (attempt > 1) {
            }
            
            return result;
        } catch (error) {
            lastError = error;
            
            // Use custom retry logic if provided
            const isRetryable = shouldRetry 
                ? shouldRetry(error)
                : error.message?.includes('Failed to fetch') ||
                  error.message?.includes('ERR_CONNECTION_REFUSED') ||
                  error.message?.includes('ECONNREFUSED');
            
            
            if (!isRetryable || attempt >= maxRetries) {
                throw error;
            }
            
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, Math.min(delay, maxDelay)));
            delay *= 2; // Exponential backoff
        }
    }
    
    throw lastError;
}

/**
 * Check if the API server is reachable
 * @returns {Promise<boolean>} - True if server is reachable
 */
export async function checkServerHealth() {
    try {
        const response = await fetch(window.location.origin + '/health', {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        
        if (response.ok) {
            const data = await response.json();
            return true;
        }
        
        console.warn('⚠️ Server health check returned non-OK status:', response.status);
        return false;
    } catch (error) {
        console.error('❌ Server health check failed:', error.message);
        return false;
    }
}

/**
 * Wrapper for fetch with automatic retries
 * @param {string} url - The URL to fetch
 * @param {RequestInit} options - Fetch options
 * @param {number} maxRetries - Maximum retries
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(url, options = {}, maxRetries = 3) {
    return retryApiCall(
        () => fetch(url, options).then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response;
        }),
        maxRetries,
        1000
    );
}

// Make available globally for console debugging
if (typeof window !== 'undefined') {
    window.apiRetry = {
        retryApiCall,
        retryApiCallWithOptions,
        checkServerHealth,
        fetchWithRetry
    };
}
