// Database-First API Utility - All data operations go through database
const DatabaseAPI = {
    // Base configuration - Use local API for localhost, production for deployed
    API_BASE: (() => {
        const hostname = window.location.hostname;
        const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
        // Always use the current origin's API (works for both localhost and droplet)
        const apiBase = window.location.origin;
        return apiBase;
    })(),
    
    // Request deduplication: prevent multiple concurrent requests to the same endpoint
    _pendingRequests: new Map(),
    
    // Short-term cache for recent responses with endpoint-specific TTL
    _responseCache: new Map(),
    _cacheTTL: 30000, // 30 seconds default - increased to reduce excessive API calls
    // Endpoint-specific cache TTLs (in milliseconds)
    _endpointCacheTTL: {
        '/clients': 60000,      // 1 minute - clients don't change frequently
        '/leads': 60000,        // 1 minute - leads don't change frequently
        '/projects': 60000,     // 1 minute - projects don't change frequently
        '/users': 120000,       // 2 minutes - users rarely change
        '/invoices': 60000,     // 1 minute
        '/time-entries': 30000, // 30 seconds
        '/inventory': 120000,   // 2 minutes - inventory changes less frequently
        '/locations': 300000,   // 5 minutes - locations rarely change
    },

    // Request throttling / rate limiting safeguards
    _maxConcurrentRequests: 2, // Reduced from 4 to prevent overwhelming the server
    _currentRequests: 0,
    _minRequestInterval: 500, // Increased from 250ms to 500ms to reduce request frequency
    _lastRequestTimestamp: 0,
    _rateLimitResumeAt: 0,
    _rateLimitCount: 0, // Track consecutive rate limit errors
    _lastRateLimitLog: null, // Track last time we logged rate limit message
    
    // Clear old cache entries periodically
    _cleanCache() {
        const now = Date.now();
        for (const [key, { timestamp }] of this._responseCache.entries()) {
            // Extract endpoint from cache key (format: "METHOD:/endpoint")
            const endpoint = key.split(':').slice(1).join(':');
            const ttl = this._endpointCacheTTL[endpoint] || this._cacheTTL;
            if (now - timestamp > ttl) {
                this._responseCache.delete(key);
            }
        }
    },

    _sleep(ms) {
        if (ms <= 0 || !Number.isFinite(ms)) return Promise.resolve();
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    async _acquireRequestSlot() {
        const tryAcquire = async (resolve) => {
            const now = Date.now();
            
            // Check if we're in a global rate limit backoff period
            if (this._rateLimitResumeAt > now) {
                const waitTime = this._rateLimitResumeAt - now;
                // Only log occasionally to reduce noise (every 5 seconds)
                if (!this._lastRateLimitLog || (now - this._lastRateLimitLog) > 5000) {
                    const waitSeconds = Math.round(waitTime / 1000);
                    const log = window.debug?.log || (() => {});
                    log(`⏸️ Global rate limit active. Waiting ${waitSeconds}s before allowing requests...`);
                    this._lastRateLimitLog = now;
                }
                setTimeout(() => tryAcquire(resolve), Math.min(waitTime, 1000)); // Check every second
                return;
            }
            
            // Reset rate limit log timestamp when no longer rate limited
            if (this._lastRateLimitLog && this._rateLimitResumeAt <= now) {
                this._lastRateLimitLog = null;
            }
            
            const nextAllowedTime = Math.max(
                this._lastRequestTimestamp + this._minRequestInterval,
                this._rateLimitResumeAt
            );

            if (this._currentRequests < this._maxConcurrentRequests && now >= nextAllowedTime) {
                this._currentRequests += 1;
                this._lastRequestTimestamp = now;
                resolve();
            } else {
                const delay = Math.max(nextAllowedTime - now, 50);
                setTimeout(() => tryAcquire(resolve), delay);
            }
        };

        return new Promise(resolve => {
            tryAcquire(resolve);
        });
    },

    _releaseRequestSlot() {
        if (this._currentRequests > 0) {
            this._currentRequests -= 1;
        }
    },

    _parseRetryAfter(retryAfter) {
        if (!retryAfter) return null;
        const numeric = Number(retryAfter);
        if (!Number.isNaN(numeric) && numeric >= 0) {
            return numeric * 1000;
        }
        const retryDate = Date.parse(retryAfter);
        if (!Number.isNaN(retryDate)) {
            return retryDate - Date.now();
        }
        return null;
    },

    async _readErrorMessage(response) {
        try {
            const text = await response.text();
            if (!text) return '';
            try {
                const json = JSON.parse(text);
                if (typeof json === 'string') return json;
                return json?.message || json?.error || json?.data?.message || JSON.stringify(json).substring(0, 200);
            } catch (_) {
                return text.substring(0, 200);
            }
        } catch (_) {
            return '';
        }
    },
    
    // Helper function to check if an error is a network error (retry-able)
    isNetworkError(error) {
        if (!error) return false;
        // Check for network-related error types
        const errorMessage = error.message?.toLowerCase() || '';
        const errorName = error.name?.toLowerCase() || '';
        const errorString = error.toString().toLowerCase();
        
        return (
            errorName === 'typeerror' ||
            errorName === 'aborterror' ||
            errorName === 'timeouterror' ||
            error.isTimeout === true ||
            errorMessage.includes('failed to fetch') ||
            errorMessage.includes('networkerror') ||
            errorMessage.includes('network request failed') ||
            errorMessage.includes('err_internet_disconnected') ||
            errorMessage.includes('err_network_changed') ||
            errorMessage.includes('err_connection_refused') ||
            errorMessage.includes('err_connection_reset') ||
            errorMessage.includes('err_connection_timed_out') ||
            errorMessage.includes('err_timed_out') ||
            errorMessage.includes('request timeout') ||
            errorMessage.includes('timeout after') ||
            errorString.includes('networkerror') ||
            errorString.includes('failed to fetch') ||
            errorString.includes('timeout')
        );
    },

    // Helper function to make authenticated requests with retry logic
    async makeRequest(endpoint, options = {}) {
        // Clean old cache entries periodically
        this._cleanCache();
        
        // Create a cache key from endpoint and method (ignore body for caching)
        const method = (options.method || 'GET').toUpperCase();
        const cacheKey = `${method}:${endpoint}`;
        
        // Check cache first (only for GET requests)
        if (method === 'GET') {
            const cached = this._responseCache.get(cacheKey);
            if (cached) {
                // Use endpoint-specific TTL if available, otherwise use default
                const ttl = this._endpointCacheTTL[endpoint] || this._cacheTTL;
                const age = Date.now() - cached.timestamp;
                if (age < ttl) {
                    return cached.data;
                } else {
                    // Remove expired cache entry
                    this._responseCache.delete(cacheKey);
                }
            }
        }
        
        // Check if there's already a pending request for this endpoint
        // Deduplicate concurrent requests
        if (this._pendingRequests.has(cacheKey)) {
            try {
                const result = await this._pendingRequests.get(cacheKey);
                return result;
            } catch (error) {
                // If the pending request failed, we'll retry below
                this._pendingRequests.delete(cacheKey);
            }
        }
        
        // Create the request promise and store it for deduplication
        const requestPromise = this._executeRequest(endpoint, options);
        this._pendingRequests.set(cacheKey, requestPromise);
        
        // Clean up after request completes (whether success or failure)
        requestPromise.finally(() => {
            this._pendingRequests.delete(cacheKey);
        });
        
        try {
            const result = await requestPromise;
            
            // Cache successful GET responses
            if (method === 'GET') {
                this._responseCache.set(cacheKey, {
                    data: result,
                    timestamp: Date.now()
                });
            }
            
            return result;
        } catch (error) {
            // Don't cache errors
            throw error;
        }
    },
    
    // Internal method to execute the actual request
    async _executeRequest(endpoint, options = {}) {
        const maxRetries = 5;
        const baseDelay = 1000; // Start with 1 second

        await this._acquireRequestSlot();
        
        try {
            let token = window.storage?.getToken?.();
            
            if (token) {
            } else {
            }

            // If no token, attempt a silent refresh using the refresh cookie
            if (!token) {
                try {
                    const refreshUrl = `${this.API_BASE}/api/auth/refresh`;
                    // Add timeout to refresh request
                    const refreshController = new AbortController();
                    const refreshTimeoutId = setTimeout(() => refreshController.abort(), 10000); // 10 second timeout
                    
                    const refreshRes = await fetch(refreshUrl, { 
                        method: 'POST', 
                        credentials: 'include', 
                        headers: { 'Content-Type': 'application/json' },
                        signal: refreshController.signal
                    });
                    clearTimeout(refreshTimeoutId);
                    
                    if (refreshRes.ok) {
                        const text = await refreshRes.text();
                        const refreshData = text ? JSON.parse(text) : {};
                        const newToken = refreshData?.data?.accessToken || refreshData?.accessToken;
                        if (newToken && window.storage?.setToken) {
                            window.storage.setToken(newToken);
                            token = newToken;
                        } else {
                            console.error('❌ Refresh response OK but no token in response');
                        }
                    } else {
                        console.error('❌ Refresh failed with status:', refreshRes.status);
                    }
                } catch (refreshError) {
                    console.error('❌ Refresh error:', refreshError);
                    // ignore refresh errors here; downstream logic will handle redirect
                }
            }

            if (!token) {
                // Still no token → ensure clean state and redirect to login
                if (window.forceLogout) {
                    window.forceLogout('SESSION_MISSING');
                } else {
                    if (window.storage?.removeToken) window.storage.removeToken();
                    if (window.storage?.removeUser) window.storage.removeUser();
                    if (window.LiveDataSync) {
                        window.LiveDataSync.stop();
                    }
                    if (!window.location.hash.includes('#/login')) {
                        window.location.hash = '#/login';
                    }
                }
                throw new Error('No authentication token found. Please log in.');
            }

            const url = `${this.API_BASE}/api${endpoint}`;
            const buildConfigWithToken = (authToken) => {
                // Extract headers from options to prevent them from overriding Authorization
                const { headers: customHeaders, ...restOptions } = options;
                
                // Merge headers properly - ensure Authorization is always included and not overridden
                const mergedHeaders = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                    ...(customHeaders || {})
                };
                
                // Explicitly set Authorization again to ensure it's never overridden
                mergedHeaders['Authorization'] = `Bearer ${authToken}`;
                
                const config = {
                    method: restOptions.method || 'GET',
                    headers: mergedHeaders,
                    credentials: 'include',
                    ...restOptions
                };
                
                // Final safeguard: ensure Authorization header is never overridden by restOptions
                if (config.headers) {
                    config.headers['Authorization'] = `Bearer ${authToken}`;
                }
                
                // Log POST requests for debugging
                if (config.method === 'POST' || config.method === 'PATCH' || config.method === 'PUT') {
                    const authHeader = config.headers['Authorization'];
                }
                
                return config;
            };

            const execute = async (authToken) => {
                const config = buildConfigWithToken(authToken);
                
                // Warn about large payloads that might cause timeouts
                if (config.body) {
                    const payloadSize = new Blob([config.body]).size;
                    if (payloadSize > 100000) { // 100KB
                        console.warn(`⚠️ Large payload detected (${(payloadSize / 1024).toFixed(2)}KB) for ${endpoint}. This may cause timeouts.`);
                    }
                }
                
                // Add timeout handling using AbortController
                const timeoutMs = options.timeout || 30000; // Default 30 seconds, configurable
                const controller = new AbortController();
                const timeoutId = setTimeout(() => {
                    controller.abort();
                }, timeoutMs);
                
                // Add abort signal to config
                config.signal = controller.signal;
                
                this._lastRequestTimestamp = Date.now();
                
                try {
                    const response = await fetch(url, config);
                    clearTimeout(timeoutId);
                    return response;
                } catch (error) {
                    clearTimeout(timeoutId);
                    
                    // Handle timeout errors specifically
                    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
                        const timeoutError = new Error(`Request timeout after ${timeoutMs}ms: ${endpoint}`);
                        timeoutError.name = 'TimeoutError';
                        timeoutError.isTimeout = true;
                        throw timeoutError;
                    }
                    
                    // Re-throw other errors
                    throw error;
                }
            };

            // Retry loop for network errors
            let lastError = null;
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    let response = await execute(token);

                if (!response.ok && response.status === 429) {
                    // Track rate limit occurrences
                    this._rateLimitCount += 1;
                    
                    // Reduce concurrent requests when rate limited
                    if (this._rateLimitCount >= 2) {
                        this._maxConcurrentRequests = 1; // Reduce to 1 concurrent request
                        this._minRequestInterval = 1000; // Increase to 1 second between requests
                    }
                    
                    const retryAfterHeader = response.headers.get('Retry-After');
                    let retryDelay = this._parseRetryAfter(retryAfterHeader);
                    
                    // If no Retry-After header, use exponential backoff with longer delays
                    if (!retryDelay || retryDelay <= 0) {
                        // Start with longer base delay and increase exponentially
                        // Also factor in consecutive rate limit errors
                        const baseDelayMultiplier = Math.min(this._rateLimitCount, 5); // Cap at 5x
                        retryDelay = baseDelay * Math.pow(2, attempt) * (1 + baseDelayMultiplier * 0.5);
                    }
                    
                    // Cap retry delay to 60 seconds (increased from 15s) to respect rate limits better
                    retryDelay = Math.min(retryDelay, 60000);
                    
                    // Set global rate limit resume time to prevent other requests
                    this._rateLimitResumeAt = Date.now() + retryDelay;
                    
                    const errorMessage = await this._readErrorMessage(response);
                    const finalMessage = errorMessage || 'Rate limit exceeded. Please try again shortly.';
                    const retrySeconds = Math.round(retryDelay / 1000);
                    
                    // Only log first rate limit error to reduce noise - use debug log for subsequent ones
                    const log = window.debug?.log || (() => {});
                    if (this._rateLimitCount === 1 || attempt === 0) {
                        console.warn(`⏳ Rate limit encountered on ${endpoint} (attempt ${attempt + 1}/${maxRetries + 1}, consecutive: ${this._rateLimitCount}). Retrying in ${retrySeconds}s...`, finalMessage);
                    } else {
                        log(`⏳ Rate limit encountered on ${endpoint} (attempt ${attempt + 1}/${maxRetries + 1}, consecutive: ${this._rateLimitCount}). Retrying in ${retrySeconds}s...`);
                    }
                    
                    if (attempt < maxRetries) {
                        await this._sleep(retryDelay);
                        continue;
                    }
                    
                    // Reset rate limit count after max retries
                    this._rateLimitCount = 0;
                    throw new Error(finalMessage);
                }
                
                // Reset rate limit count and restore normal limits on successful request
                if (response.ok) {
                    if (this._rateLimitCount > 0) {
                        // Gradually restore normal limits after successful requests
                        if (this._rateLimitCount > 3) {
                            // After many rate limits, restore slowly
                            this._maxConcurrentRequests = 1;
                            this._minRequestInterval = 750;
                        } else {
                            // Restore to normal after a few successful requests
                            this._maxConcurrentRequests = 2;
                            this._minRequestInterval = 500;
                        }
                    }
                    this._rateLimitCount = 0;
                }

                    if (!response.ok && response.status === 401) {
                    // Attempt refresh once before giving up
                    let refreshSucceeded = false;
                    try {
                        const refreshUrl = `${this.API_BASE}/api/auth/refresh`;
                        // Add timeout to refresh request as well
                        const refreshController = new AbortController();
                        const refreshTimeoutId = setTimeout(() => refreshController.abort(), 10000); // 10 second timeout for refresh
                        
                        const refreshRes = await fetch(refreshUrl, { 
                            method: 'POST', 
                            credentials: 'include', 
                            headers: { 'Content-Type': 'application/json' },
                            signal: refreshController.signal
                        });
                        clearTimeout(refreshTimeoutId);
                        
                        if (refreshRes.ok) {
                            const text = await refreshRes.text();
                            const refreshData = text ? JSON.parse(text) : {};
                            const newToken = refreshData?.data?.accessToken || refreshData?.accessToken;
                            if (newToken && window.storage?.setToken) {
                                window.storage.setToken(newToken);
                                token = newToken;
                                // Retry the original request with the new token
                                response = await execute(newToken);
                                refreshSucceeded = true;
                            } else {
                                console.error('❌ Token refresh failed: No token in response');
                            }
                        } else {
                            console.error('❌ Token refresh failed with status:', refreshRes.status);
                        }
                    } catch (refreshError) {
                        console.error('❌ Token refresh error:', refreshError);
                        // If refresh fails, don't retry - force logout immediately
                        if (window.forceLogout) {
                            window.forceLogout('SESSION_EXPIRED');
                        } else {
                            if (window.storage?.removeToken) window.storage.removeToken();
                            if (window.storage?.removeUser) window.storage.removeUser();
                            if (window.LiveDataSync) {
                                window.LiveDataSync.stop();
                            }
                            if (!window.location.hash.includes('#/login')) {
                                window.location.hash = '#/login';
                            }
                        }
                        throw new Error('Authentication expired. Please log in again.');
                    }
                    
                    // If refresh didn't succeed and we still have a 401, don't retry
                    if (!refreshSucceeded && response.status === 401) {
                        if (window.forceLogout) {
                            window.forceLogout('SESSION_EXPIRED');
                        } else {
                            if (window.storage?.removeToken) window.storage.removeToken();
                            if (window.storage?.removeUser) window.storage.removeUser();
                            if (window.LiveDataSync) {
                                window.LiveDataSync.stop();
                            }
                            if (!window.location.hash.includes('#/login')) {
                                window.location.hash = '#/login';
                            }
                        }
                        throw new Error('Authentication expired. Please log in again.');
                    }
                }

                    if (!response.ok) {
                    // Try to extract backend error message for better debugging
                    let serverError = null;
                    let serverErrorMessage = '';
                    try {
                        const errorText = await response.text();
                        if (errorText) {
                            try {
                                const json = JSON.parse(errorText);
                                // Extract full error object if present
                                if (json?.error && typeof json.error === 'object') {
                                    serverError = json.error;
                                    serverErrorMessage = json.error.message || '';
                                } else {
                                    serverErrorMessage =
                                        json?.message ||
                                        json?.data?.message ||
                                        (typeof json?.error === 'string' ? json.error : '');
                                }
                            } catch (_) {
                                serverErrorMessage = errorText.substring(0, 200);
                            }
                        }
                    } catch (_) {
                        // ignore parse failures
                    }

                    // Check if this is a retry-able server error (500, 502, 503, 504)
                    // 500 errors are often temporary server issues and should be retried
                    const isRetryableServerError = response.status === 500 || response.status === 502 || response.status === 503 || response.status === 504;
                    
                    if (isRetryableServerError && attempt < maxRetries) {
                        // Use shorter delays for 502 errors (Bad Gateway - often transient)
                        // 502 errors typically resolve quickly, so retry faster
                        const is502Error = response.status === 502;
                        const retryBaseDelay = is502Error ? 300 : baseDelay; // 300ms for 502, 1000ms for others
                        const delay = retryBaseDelay * Math.pow(2, attempt);
                        // Suppress warnings for 500 errors (expected when backend has issues)
                        // Only log warnings for 502/503/504 (gateway/proxy errors)
                        if (attempt === 0 && response.status !== 500) {
                            console.warn(`⚠️ Server error ${response.status} on ${endpoint} (attempt ${attempt + 1}/${maxRetries + 1}). Retrying in ${delay}ms...`);
                        }
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue; // Retry the request
                    }

                    if (response.status === 401) {
                        // Any unauthorized after optional refresh -> force logout and redirect
                        if (window.forceLogout) {
                            window.forceLogout('SESSION_EXPIRED');
                        } else {
                            if (window.storage?.removeToken) window.storage.removeToken();
                            if (window.storage?.removeUser) window.storage.removeUser();
                            if (window.LiveDataSync) {
                                window.LiveDataSync.stop();
                            }
                            if (!window.location.hash.includes('#/login')) {
                                window.location.hash = '#/login';
                            }
                        }
                        throw new Error(serverErrorMessage || 'Authentication expired or unauthorized.');
                    }
                    
                    // Handle database connection errors with user-friendly messages
                    if (serverError && serverError.code === 'DATABASE_CONNECTION_ERROR') {
                        const errorMsg = serverError.details || serverError.message || 'Database connection failed';
                        // Suppress database connection error logs - they're expected when DB is unreachable
                        // The error is still thrown for proper error handling, just not logged
                        throw new Error(`Database connection failed. The database server is unreachable. Please contact support if this issue persists.`);
                    }
                    
                    // Handle 500 errors gracefully - but log details for debugging
                    if (response.status === 500) {
                        // Log the actual error response for debugging (only on first attempt to avoid spam)
                        if (attempt === 0) {
                            console.error(`❌ Server Error 500 on ${endpoint}:`, {
                                endpoint,
                                method: options.method || 'GET',
                                errorMessage: serverErrorMessage || 'No error message provided',
                                errorCode: serverError?.code || 'SERVER_ERROR',
                                errorDetails: serverError?.details || serverError?.message,
                                status: response.status,
                                statusText: response.statusText,
                                fullError: serverError || { message: serverErrorMessage }
                            });
                        }
                        // Include "500" in the error message so catch block can recognize it as server error
                        const errorMessage = serverErrorMessage || 'Server error 500: The server encountered an error processing your request.';
                        throw new Error(errorMessage);
                    }
                    
                    // Handle 502 Bad Gateway errors
                    if (response.status === 502) {
                        // Include "502" in the error message so catch block can recognize it
                        const errorMessage = serverErrorMessage || `Bad Gateway (502): The server is temporarily unavailable. All retry attempts exhausted.`;
                        throw new Error(`502: ${errorMessage}`);
                    }
                    
                    // Handle 503 Service Unavailable errors
                    if (response.status === 503) {
                        const errorMessage = serverErrorMessage || `Service Unavailable (503): The service is temporarily unavailable.`;
                        throw new Error(`503: ${errorMessage}`);
                    }
                    
                    // Handle 504 Gateway Timeout errors
                    if (response.status === 504) {
                        const errorMessage = serverErrorMessage || `Gateway Timeout (504): The request timed out.`;
                        throw new Error(`504: ${errorMessage}`);
                    }
                    
                    // For other errors, use the server's error message if available
                    const statusText = response.statusText || 'Error';
                    const msg = serverErrorMessage || '';
                    const errorMessage = msg ? `${statusText}${msg}` : `HTTP ${response.status}: ${statusText}`;
                    throw new Error(errorMessage);
                }

                // Check if response is JSON
                const contentType = response.headers.get('content-type');
                if (!contentType || !contentType.includes('application/json')) {
                    const text = await response.text();
                    console.error(`Non-JSON response from ${endpoint}:`, text.substring(0, 200));
                    throw new Error(`Server returned non-JSON response. Status: ${response.status}`);
                }

                const data = await response.json();
                // Only log for non-cached responses to reduce noise
                if (!this._responseCache.has(`${(options.method || 'GET').toUpperCase()}:${endpoint}`)) {
                }
                return data;
                } catch (error) {
                    lastError = error;
                    
                    // Check if error message indicates a 500/502/503/504 that we should retry
                    const isServerError = error.message?.includes('500') || error.message?.includes('502') || error.message?.includes('503') || error.message?.includes('504');
                    
                    // Check if it's a timeout error (should be retried)
                    const isTimeout = error.isTimeout === true || 
                                     error.name === 'TimeoutError' || 
                                     error.name === 'AbortError' ||
                                     error.message?.includes('timeout') ||
                                     error.message?.includes('ERR_TIMED_OUT');
                    
                    // Only retry on network errors, timeout errors, or server errors (502/503/504), not on other HTTP errors or auth errors
                    const isNetwork = this.isNetworkError(error);
                    const shouldRetry = (isNetwork || isTimeout || isServerError) && attempt < maxRetries;
                    
                    if (shouldRetry) {
                        // Calculate exponential backoff delay: 1s, 2s, 4s
                        const delay = baseDelay * Math.pow(2, attempt);
                        const errorType = isTimeout ? 'Timeout error' : (isServerError ? 'Server error' : 'Network error');
                        console.warn(`⚠️ ${errorType} on ${endpoint} (attempt ${attempt + 1}/${maxRetries + 1}). Retrying in ${delay}ms...`, error.message);
                        await this._sleep(delay);
                        continue; // Retry the request
                    } else {
                        // Don't retry - log and throw
                        if ((isNetwork || isServerError) && attempt === maxRetries) {
                            // Check if it's a database connection error - suppress logs for these
                            const errorMessage = error?.message || String(error);
                            const isDatabaseError = errorMessage.includes('Database connection failed') ||
                                                  errorMessage.includes('unreachable') ||
                                                  errorMessage.includes('ECONNREFUSED') ||
                                                  errorMessage.includes('ETIMEDOUT');
                            
                            // Only log non-database errors and non-server errors (server errors are expected when backend is down)
                            // Suppress console.error for server errors (500, 502, 503, 504) to reduce noise
                            if (!isDatabaseError && !isServerError) {
                                console.error(`❌ Database API request failed after ${maxRetries + 1} attempts (${endpoint}):`, error);
                            }
                            if (isServerError) {
                                // Preserve the original error message so it can be identified by error handlers
                                // The error message should include the status code (e.g., "502:", "503:", etc.)
                                const originalMessage = error?.message || 'Server error';
                                throw new Error(originalMessage);
                            } else {
                                throw new Error(`Network error: Unable to connect to server. Please check your internet connection and try again.`);
                            }
                        } else {
                            // Check if it's a database connection error - suppress logs for these
                            const errorMessage = error?.message || String(error);
                            const isDatabaseError = errorMessage.includes('Database connection failed') ||
                                                  errorMessage.includes('unreachable') ||
                                                  errorMessage.includes('ECONNREFUSED') ||
                                                  errorMessage.includes('ETIMEDOUT');
                            
                            // Suppress error logs for server errors and database errors
                            const isServerError = error.message?.includes('500') || error.message?.includes('502') || error.message?.includes('503') || error.message?.includes('504');
                            if (!isDatabaseError && !isServerError) {
                                console.error(`❌ Database API request failed (${endpoint}):`, error);
                            }
                            throw error;
                        }
                    }
                }
            }
            
            // Should never reach here, but just in case
            throw lastError || new Error(`Unknown error occurred while making request to ${endpoint}`);
        } finally {
            this._releaseRequestSlot();
        }
    },
    
    async _callPurchaseOrdersEndpoint(pathSuffix = '', requestOptions = {}) {
        const suffix = pathSuffix ? `/${pathSuffix.replace(/^\//, '')}` : '';
        // Use the canonical /purchase-orders endpoint.
        // The /manufacturing/purchase-orders route is legacy and always returns
        // a 400 with a hint; the client should not rely on it.
        const endpoint = `/purchase-orders${suffix}`;
        return this.makeRequest(endpoint, requestOptions);
    },

    // CLIENT OPERATIONS
    async getClients() {
        const response = await this.makeRequest('/clients');
        const clients = response?.data?.clients || [];
        if (clients.length === 0) {
            console.warn('⚠️ WARNING: No clients found in database response. This could indicate:');
            console.warn('   1. Database is empty (no client records exist)');
            console.warn('   2. All records have type != "client" (they might be leads or null)');
            console.warn('   3. Response structure mismatch');
        }
        return response;
    },

    async getClient(id) {
        const response = await this.makeRequest(`/clients/${id}`);
        return response;
    },

    async createClient(clientData) {
        const response = await this.makeRequest('/clients', {
            method: 'POST',
            body: JSON.stringify(clientData)
        });
        return response;
    },

    async updateClient(id, clientData) {
        const response = await this.makeRequest(`/clients/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(clientData)
        });
        return response;
    },

    async deleteClient(id) {
        const response = await this.makeRequest(`/clients/${id}`, {
            method: 'DELETE'
        });
        return response;
    },

    // LEAD OPERATIONS
    async getLeads(forceRefresh = false) {
        // If forceRefresh, we need to bypass any caching layers
        // Add cache-busting query param to bypass any HTTP/proxy caches
        const endpoint = forceRefresh ? `/leads?_t=${Date.now()}` : '/leads';
        const raw = await this.makeRequest(endpoint);
        // Normalize payload to { data: { leads: [...] } } for downstream consumers
        const normalized = {
            data: {
                leads: Array.isArray(raw?.data?.leads)
                    ? raw.data.leads
                    : Array.isArray(raw?.data)
                        ? raw.data
                        : []
            }
        };
        if (normalized.data.leads.length === 0) {
            console.warn('⚠️ WARNING: No leads found in database response. This could indicate:');
            console.warn('   1. Database is empty (no lead records exist)');
            console.warn('   2. All records have type != "lead" (they might be clients or null)');
            console.warn('   3. Response structure mismatch');
        }
        return normalized;
    },

    async getLead(id) {
        const response = await this.makeRequest(`/leads/${id}`);
        return response;
    },

    async createLead(leadData) {
        const response = await this.makeRequest('/leads', {
            method: 'POST',
            body: JSON.stringify(leadData)
        });
        return response;
    },

    /**
     * Process attachments: Extract base64 attachments and upload them separately
     * This prevents 502 errors from large payloads by uploading files first, then replacing dataUrl with URLs
     */
    async processAttachments(leadData) {
        const processedData = JSON.parse(JSON.stringify(leadData)); // Deep clone
        let attachmentCount = 0;
        let uploadedCount = 0;
        const originalSize = JSON.stringify(leadData).length;
        
        // Helper function to upload a single attachment
        const uploadAttachment = async (attachment, folder = 'comments') => {
            // Skip if already has URL or no dataUrl
            if (!attachment.dataUrl || !attachment.dataUrl.startsWith('data:')) {
                return false;
            }
            
            // Skip if already has a URL (already uploaded)
            if (attachment.url && attachment.url.startsWith('/uploads/')) {
                return false;
            }
            
            attachmentCount++;
            try {
                const token = window.storage?.getToken?.();
                const response = await fetch(`${this.API_BASE}/api/files`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                    },
                    body: JSON.stringify({
                        folder: folder,
                        name: attachment.name || `attachment-${Date.now()}.pdf`,
                        dataUrl: attachment.dataUrl
                    })
                });
                
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error?.message || `Upload failed (${response.status})`);
                }
                
                const json = await response.json();
                const fileUrl = json.data?.url || json.url;
                
                if (fileUrl) {
                    // Replace dataUrl with file URL, keep other attachment properties
                    attachment.url = fileUrl;
                    delete attachment.dataUrl; // Remove large base64 data
                    uploadedCount++;
                    return true;
                }
            } catch (err) {
                console.error(`❌ Error uploading attachment "${attachment.name || 'unnamed'}":`, err);
                // Don't throw - continue processing other attachments
            }
            return false;
        };
        
        // Process comments array for attachments
        if (Array.isArray(processedData.comments)) {
            for (const comment of processedData.comments) {
                if (Array.isArray(comment.attachments)) {
                    for (const attachment of comment.attachments) {
                        await uploadAttachment(attachment, 'comments');
                    }
                }
            }
        }
        
        // Process sites documents
        if (Array.isArray(processedData.sites)) {
            for (const site of processedData.sites) {
                if (site.documents && Array.isArray(site.documents)) {
                    for (const doc of site.documents) {
                        await uploadAttachment(doc, 'sites');
                    }
                }
            }
        }
        
        if (attachmentCount > 0) {
            const newSize = JSON.stringify(processedData).length;
            const reduction = originalSize > 0 ? ((1 - newSize / originalSize) * 100).toFixed(1) : 0;
        }
        
        return processedData;
    },

    async updateLead(id, leadData) {
        
        // Process attachments before sending (upload base64 attachments separately)
        // This prevents 502 errors from large payloads
        let leadDataToSend = leadData;
        try {
            leadDataToSend = await this.processAttachments(leadData);
        } catch (err) {
            console.warn('⚠️ Attachment processing failed, using original data:', err);
            // Continue with original data - attachment processing is best-effort
        }
        
        const payloadSize = JSON.stringify(leadDataToSend).length;
        
        if (payloadSize > 50000) { // Warn if still > 50KB
            console.warn(`⚠️ Payload is still large (${(payloadSize / 1024).toFixed(1)}KB). This may cause 502 errors.`);
        }
        
        const response = await this.makeRequest(`/leads/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(leadDataToSend)
        });
        return response;
    },

    async deleteLead(id) {
        const response = await this.makeRequest(`/leads/${id}`, {
            method: 'DELETE'
        });
        return response;
    },

    // PROJECT OPERATIONS
    async getProjects() {
        const response = await this.makeRequest('/projects');
        const projectsCount = response?.data?.projects?.length || response?.data?.length || response?.projects?.length || 0;
        return response;
    },

    async getProject(id) {
        const response = await this.makeRequest(`/projects/${id}`);
        return response;
    },

    async createProject(projectData) {
        const response = await this.makeRequest('/projects', {
            method: 'POST',
            body: JSON.stringify(projectData)
        });
        return response;
    },

    async updateProject(id, projectData) {
        const response = await this.makeRequest(`/projects/${id}`, {
            method: 'PUT',
            body: JSON.stringify(projectData)
        });
        // Invalidate project caches so subsequent loads pull fresh data
        this._responseCache.delete('GET:/projects');
        this._responseCache.delete(`GET:/projects/${id}`);
        return response;
    },

    async updateProjectMonthlyProgress(id, monthlyProgress) {
        const response = await this.makeRequest(`/projects-monthly-progress/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ monthlyProgress })
        });
        // Invalidate project caches so subsequent loads pull fresh data
        this._responseCache.delete('GET:/projects');
        this._responseCache.delete(`GET:/projects/${id}`);
        return response;
    },

    async deleteProject(id) {
        const response = await this.makeRequest(`/projects/${id}`, {
            method: 'DELETE'
        });
        return response;
    },

    // INVOICE OPERATIONS
    async getInvoices() {
        const response = await this.makeRequest('/invoices');
        return response;
    },

    async getInvoice(id) {
        const response = await this.makeRequest(`/invoices/${id}`);
        return response;
    },

    async createInvoice(invoiceData) {
        const response = await this.makeRequest('/invoices', {
            method: 'POST',
            body: JSON.stringify(invoiceData)
        });
        return response;
    },

    async updateInvoice(id, invoiceData) {
        const response = await this.makeRequest(`/invoices/${id}`, {
            method: 'PUT',
            body: JSON.stringify(invoiceData)
        });
        return response;
    },

    async deleteInvoice(id) {
        const response = await this.makeRequest(`/invoices/${id}`, {
            method: 'DELETE'
        });
        return response;
    },

    // TIME TRACKING OPERATIONS
    async getTimeEntries() {
        const response = await this.makeRequest('/time-entries');
        return response;
    },

    async createTimeEntry(timeEntryData) {
        const response = await this.makeRequest('/time-entries', {
            method: 'POST',
            body: JSON.stringify(timeEntryData)
        });
        return response;
    },

    async updateTimeEntry(id, timeEntryData) {
        const response = await this.makeRequest(`/time-entries/${id}`, {
            method: 'PUT',
            body: JSON.stringify(timeEntryData)
        });
        return response;
    },

    async deleteTimeEntry(id) {
        const response = await this.makeRequest(`/time-entries/${id}`, {
            method: 'DELETE'
        });
        return response;
    },

    // USER OPERATIONS
    async getUsers() {
        const response = await this.makeRequest('/users');
        const usersCount = response.data?.users?.length || response.data?.data?.users?.length || (Array.isArray(response.data) ? response.data.length : 0);
        return response;
    },

    async inviteUser(userData) {
        const response = await this.makeRequest('/users/invite', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
        return response;
    },

    // SETTINGS OPERATIONS
    async getSettings() {
        const response = await this.makeRequest('/settings');
        return response;
    },

    async updateSettings(settingsData) {
        const response = await this.makeRequest('/settings', {
            method: 'PUT',
            body: JSON.stringify(settingsData)
        });
        return response;
    },

    // BULK OPERATIONS
    async bulkUpdateClients(clientsData) {
        const response = await this.makeRequest('/clients/bulk', {
            method: 'PUT',
            body: JSON.stringify({ clients: clientsData })
        });
        return response;
    },

    async bulkDeleteClients(clientIds) {
        const response = await this.makeRequest('/clients/bulk', {
            method: 'DELETE',
            body: JSON.stringify({ ids: clientIds })
        });
        return response;
    },

    // SEARCH OPERATIONS
    async searchClients(query) {
        const response = await this.makeRequest(`/clients/search?q=${encodeURIComponent(query)}`);
        return response;
    },

    async searchLeads(query) {
        const response = await this.makeRequest(`/leads/search?q=${encodeURIComponent(query)}`);
        return response;
    },

    // ANALYTICS OPERATIONS
    async getClientAnalytics() {
        const response = await this.makeRequest('/analytics/clients');
        return response;
    },

    async getLeadAnalytics() {
        const response = await this.makeRequest('/analytics/leads');
        return response;
    },

    async getRevenueAnalytics() {
        const response = await this.makeRequest('/analytics/revenue');
        return response;
    },

    // OPPORTUNITIES OPERATIONS
    async getOpportunities() {
        const response = await this.makeRequest('/opportunities');
        return response;
    },

    async getOpportunitiesByClient(clientId) {
        const response = await this.makeRequest(`/opportunities/client/${clientId}`);
        return response;
    },

    async getOpportunity(id) {
        const response = await this.makeRequest(`/opportunities/${id}`);
        return response;
    },

    async createOpportunity(opportunityData) {
        const response = await this.makeRequest('/opportunities', {
            method: 'POST',
            body: JSON.stringify(opportunityData)
        });
        return response;
    },

    async updateOpportunity(id, opportunityData) {
        const response = await this.makeRequest(`/opportunities/${id}`, {
            method: 'PUT',
            body: JSON.stringify(opportunityData)
        });
        return response;
    },

    async deleteOpportunity(id) {
        const response = await this.makeRequest(`/opportunities/${id}`, {
            method: 'DELETE'
        });
        return response;
    },

    // MANUFACTURING OPERATIONS - INVENTORY
    async getInventory(locationId = null) {
        const endpoint = locationId && locationId !== 'all' ? `/manufacturing/inventory?locationId=${locationId}` : '/manufacturing/inventory';
        const raw = await this.makeRequest(endpoint);
        const normalized = {
            data: {
                inventory: Array.isArray(raw?.data?.inventory)
                    ? raw.data.inventory
                    : Array.isArray(raw?.inventory)
                        ? raw.inventory
                        : Array.isArray(raw?.data)
                            ? raw.data
                            : []
            }
        };
        return normalized;
    },

    async createInventoryItem(itemData) {
        const response = await this.makeRequest('/manufacturing/inventory', {
            method: 'POST',
            body: JSON.stringify(itemData)
        });
        return response;
    },

    async updateInventoryItem(id, itemData) {
        const response = await this.makeRequest(`/manufacturing/inventory/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(itemData)
        });
        return response;
    },

    async deleteInventoryItem(id) {
        const response = await this.makeRequest(`/manufacturing/inventory/${id}`, {
            method: 'DELETE'
        });

        // Invalidate any cached inventory responses so deleted items
        // don't "reappear" from the cache and then fail with 404s
        try {
            // Clear generic inventory cache (all locations)
            this.clearEndpointCache('/manufacturing/inventory', 'GET');

            // Also clear any per-location inventory caches
            if (this._responseCache && typeof this._responseCache.keys === 'function') {
                const keysToDelete = [];
                for (const key of this._responseCache.keys()) {
                    if (typeof key === 'string' && key.startsWith('GET:/manufacturing/inventory?locationId=')) {
                        keysToDelete.push(key);
                    }
                }
                keysToDelete.forEach(key => {
                    this._responseCache.delete(key);
                });
            }

            // Clear any pending requests for inventory endpoints
            if (this._pendingRequests && typeof this._pendingRequests.keys === 'function') {
                const pendingKeysToDelete = [];
                for (const key of this._pendingRequests.keys()) {
                    if (
                        typeof key === 'string' &&
                        (key === 'GET:/manufacturing/inventory' ||
                         key.startsWith('GET:/manufacturing/inventory?locationId='))
                    ) {
                        pendingKeysToDelete.push(key);
                    }
                }
                pendingKeysToDelete.forEach(key => {
                    this._pendingRequests.delete(key);
                });
            }
        } catch (cacheError) {
            // Never break deletion flow because of cache cleanup issues
            console.warn('⚠️ Failed to clear inventory cache after delete:', cacheError);
        }

        return response;
    },

    // MANUFACTURING OPERATIONS - STOCK LOCATIONS
    async getStockLocations() {
        const raw = await this.makeRequest('/manufacturing/locations');
        const normalized = {
            data: {
                locations: Array.isArray(raw?.data?.locations)
                    ? raw.data.locations
                    : Array.isArray(raw?.locations)
                        ? raw.locations
                        : Array.isArray(raw?.data)
                            ? raw.data
                            : []
            }
        };
        return normalized;
    },

    async createStockLocation(locationData) {
        
        try {
            const response = await this.makeRequest('/manufacturing/locations', {
                method: 'POST',
                body: JSON.stringify(locationData),
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            return response;
        } catch (error) {
            console.error('❌ Error in createStockLocation:', error);
            console.error('❌ Error details:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
            throw error;
        }
    },

    async updateStockLocation(id, locationData) {
        const response = await this.makeRequest(`/manufacturing/locations/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(locationData)
        });
        return response;
    },

    async deleteStockLocation(id) {
        const response = await this.makeRequest(`/manufacturing/locations/${id}`, {
            method: 'DELETE'
        });
        return response;
    },

    // MANUFACTURING OPERATIONS - BOMs
    async getBOMs() {
        const raw = await this.makeRequest('/manufacturing/boms');
        const normalized = {
            data: {
                boms: Array.isArray(raw?.data?.boms)
                    ? raw.data.boms
                    : Array.isArray(raw?.boms)
                        ? raw.boms
                        : Array.isArray(raw?.data)
                            ? raw.data
                            : []
            }
        };
        return normalized;
    },

    async createBOM(bomData) {
        const response = await this.makeRequest('/manufacturing/boms', {
            method: 'POST',
            body: JSON.stringify(bomData)
        });
        return response;
    },

    async updateBOM(id, bomData) {
        const response = await this.makeRequest(`/manufacturing/boms/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(bomData)
        });
        return response;
    },

    async deleteBOM(id) {
        const response = await this.makeRequest(`/manufacturing/boms/${id}`, {
            method: 'DELETE'
        });
        return response;
    },

    // MANUFACTURING OPERATIONS - PRODUCTION ORDERS
    async getProductionOrders() {
        const raw = await this.makeRequest('/manufacturing/production-orders');
        const normalized = {
            data: {
                productionOrders: Array.isArray(raw?.data?.productionOrders)
                    ? raw.data.productionOrders
                    : Array.isArray(raw?.productionOrders)
                        ? raw.productionOrders
                        : Array.isArray(raw?.data)
                            ? raw.data
                            : []
            }
        };
        return normalized;
    },

    async createProductionOrder(orderData) {
        const response = await this.makeRequest('/manufacturing/production-orders', {
            method: 'POST',
            body: JSON.stringify(orderData)
        });
        return response;
    },

    async updateProductionOrder(id, orderData) {
        const response = await this.makeRequest(`/manufacturing/production-orders/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(orderData)
        });
        return response;
    },

    async deleteProductionOrder(id) {
        const response = await this.makeRequest(`/manufacturing/production-orders/${id}`, {
            method: 'DELETE'
        });
        return response;
    },

    // SALES ORDERS
    async getSalesOrders() {
        const raw = await this.makeRequest('/sales-orders');
        const normalized = {
            data: {
                salesOrders: Array.isArray(raw?.data?.salesOrders)
                    ? raw.data.salesOrders
                    : Array.isArray(raw?.salesOrders)
                        ? raw.salesOrders
                        : Array.isArray(raw?.data)
                            ? raw.data
                            : []
            }
        };
        return normalized;
    },

    async createSalesOrder(orderData) {
        const response = await this.makeRequest('/sales-orders', {
            method: 'POST',
            body: JSON.stringify(orderData)
        });
        return response;
    },

    async updateSalesOrder(id, orderData) {
        const response = await this.makeRequest(`/sales-orders/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(orderData)
        });
        return response;
    },

    async deleteSalesOrder(id) {
        const response = await this.makeRequest(`/sales-orders/${id}`, {
            method: 'DELETE'
        });
        return response;
    },

    // MANUFACTURING OPERATIONS - STOCK MOVEMENTS
    async getStockMovements() {
        const raw = await this.makeRequest('/manufacturing/stock-movements');
        const normalized = {
            data: {
                movements: Array.isArray(raw?.data?.movements)
                    ? raw.data.movements
                    : Array.isArray(raw?.movements)
                        ? raw.movements
                        : Array.isArray(raw?.data)
                            ? raw.data
                            : []
            }
        };
        return normalized;
    },

    // STOCK TRANSACTIONS (per-location aware)
    async createStockTransaction(data) {
        const response = await this.makeRequest('/manufacturing/stock-transactions', {
            method: 'POST',
            body: JSON.stringify(data)
        })
        return response
    },

    async createStockMovement(movementData) {
        const response = await this.makeRequest('/manufacturing/stock-movements', {
            method: 'POST',
            body: JSON.stringify(movementData)
        });
        return response;
    },

    async deleteStockMovement(id) {
        const response = await this.makeRequest(`/manufacturing/stock-movements/${id}`, {
            method: 'DELETE'
        });
        return response;
    },

    // MANUFACTURING OPERATIONS - RECEIVING AND BOM CONSUMPTION
    async receiveStock(receiptData) {
        const response = await this.makeRequest('/manufacturing/stock-movements', {
            method: 'POST',
            body: JSON.stringify({
                ...receiptData,
                type: 'receipt'
            })
        })
        return response
    },

    async consumeBomForProduction(orderId, payload = {}) {
        const response = await this.makeRequest(`/manufacturing/production-orders/${orderId}/consume`, {
            method: 'POST',
            body: JSON.stringify(payload)
        })
        return response
    },

    // MANUFACTURING OPERATIONS - SUPPLIERS
    async getSuppliers() {
        const raw = await this.makeRequest('/manufacturing/suppliers');
        const normalized = {
            data: {
                suppliers: Array.isArray(raw?.data?.suppliers)
                    ? raw.data.suppliers
                    : Array.isArray(raw?.suppliers)
                        ? raw.suppliers
                        : Array.isArray(raw?.data)
                            ? raw.data
                            : []
            }
        };
        return normalized;
    },

    async createSupplier(supplierData) {
        const response = await this.makeRequest('/manufacturing/suppliers', {
            method: 'POST',
            body: JSON.stringify(supplierData)
        });
        return response;
    },

    async updateSupplier(id, supplierData) {
        const response = await this.makeRequest(`/manufacturing/suppliers/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(supplierData)
        });
        return response;
    },

    async deleteSupplier(id) {
        const response = await this.makeRequest(`/manufacturing/suppliers/${id}`, {
            method: 'DELETE'
        });
        return response;
    },

    // PURCHASE ORDERS OPERATIONS
    async getPurchaseOrders() {
        const raw = await this._callPurchaseOrdersEndpoint();
        const normalized = {
            data: {
                purchaseOrders: Array.isArray(raw?.data?.purchaseOrders)
                    ? raw.data.purchaseOrders
                    : Array.isArray(raw?.purchaseOrders)
                        ? raw.purchaseOrders
                        : Array.isArray(raw?.data)
                            ? raw.data
                            : []
            }
        };
        return normalized;
    },

    async getPurchaseOrder(id) {
        const response = await this._callPurchaseOrdersEndpoint(id);
        return response;
    },

    async createPurchaseOrder(purchaseOrderData) {
        const response = await this._callPurchaseOrdersEndpoint('', {
            method: 'POST',
            body: JSON.stringify(purchaseOrderData)
        });
        return response;
    },

    async updatePurchaseOrder(id, purchaseOrderData) {
        const response = await this._callPurchaseOrdersEndpoint(id, {
            method: 'PATCH',
            body: JSON.stringify(purchaseOrderData)
        });
        return response;
    },

    async deletePurchaseOrder(id) {
        const response = await this._callPurchaseOrdersEndpoint(id, {
            method: 'DELETE'
        });
        return response;
    },

    // JOB CARDS OPERATIONS
    async getJobCards() {
        const raw = await this.makeRequest('/jobcards');
        const normalized = {
            data: {
                jobCards: Array.isArray(raw?.data?.jobCards)
                    ? raw.data.jobCards
                    : Array.isArray(raw?.jobCards)
                        ? raw.jobCards
                        : Array.isArray(raw?.data)
                            ? raw.data
                            : []
            }
        };
        return normalized;
    },

    async getJobCard(id) {
        const response = await this.makeRequest(`/jobcards/${id}`);
        return response;
    },

    async createJobCard(jobCardData) {
        const response = await this.makeRequest('/jobcards', {
            method: 'POST',
            body: JSON.stringify(jobCardData)
        });
        // Clear cache for job cards list to ensure fresh data
        this._responseCache.delete('GET:/jobcards');
        return response;
    },

    async updateJobCard(id, jobCardData) {
        const response = await this.makeRequest(`/jobcards/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(jobCardData)
        });
        // Clear cache for both list and individual job card
        this._responseCache.delete('GET:/jobcards');
        this._responseCache.delete(`GET:/jobcards/${id}`);
        return response;
    },

    async deleteJobCard(id) {
        const response = await this.makeRequest(`/jobcards/${id}`, {
            method: 'DELETE'
        });
        
        // Verify deletion was successful
        if (response?.data?.deleted === true || response?.deleted === true) {
        } else {
            console.warn('⚠️ Delete response does not indicate success:', response);
        }
        
        // Clear cache for job cards list and individual job card to ensure fresh data
        this._responseCache.delete('GET:/jobcards');
        this._responseCache.delete(`GET:/jobcards/${id}`);
        return response;
    },

    // STAR CLIENT/LEAD
    async starClient(clientId) {
        const response = await this.makeRequest(`/starred-clients/${clientId}`, {
            method: 'PUT'
        });
        // Clear cache for clients and leads to refresh starred status
        this._responseCache.delete('GET:/clients');
        this._responseCache.delete('GET:/leads');
        return response;
    },

    async unstarClient(clientId) {
        const response = await this.makeRequest(`/starred-clients/${clientId}`, {
            method: 'PUT'
        });
        // Clear cache for clients and leads to refresh starred status
        this._responseCache.delete('GET:/clients');
        this._responseCache.delete('GET:/leads');
        return response;
    },

    async toggleStarClient(clientId) {
        const response = await this.makeRequest(`/starred-clients/${clientId}`, {
            method: 'PUT'
        });
        // Clear cache for clients and leads to refresh starred status
        this._responseCache.delete('GET:/clients');
        this._responseCache.delete('GET:/leads');
        return response;
    },

    async getStarredClients() {
        const response = await this.makeRequest('/starred-clients');
        return response;
    },

    // STAR OPPORTUNITY
    async starOpportunity(opportunityId) {
        const response = await this.makeRequest(`/starred-opportunities/${opportunityId}`, {
            method: 'PUT'
        });
        this._responseCache.delete('GET:/opportunities');
        return response;
    },

    async unstarOpportunity(opportunityId) {
        const response = await this.makeRequest(`/starred-opportunities/${opportunityId}`, {
            method: 'PUT'
        });
        this._responseCache.delete('GET:/opportunities');
        return response;
    },

    async toggleStarOpportunity(opportunityId) {
        const response = await this.makeRequest(`/starred-opportunities/${opportunityId}`, {
            method: 'PUT'
        });
        this._responseCache.delete('GET:/opportunities');
        return response;
    },

    async getStarredOpportunities() {
        const response = await this.makeRequest('/starred-opportunities');
        return response;
    },

    // VEHICLES
    async getVehicles() {
        const response = await this.makeRequest('/vehicles');
        return response;
    },

    async getVehicle(id) {
        const response = await this.makeRequest(`/vehicles/${id}`);
        return response;
    },

    async createVehicle(vehicleData) {
        const response = await this.makeRequest('/vehicles', {
            method: 'POST',
            body: JSON.stringify(vehicleData)
        });
        return response;
    },

    async updateVehicle(id, vehicleData) {
        const response = await this.makeRequest(`/vehicles/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(vehicleData)
        });
        return response;
    },

    async deleteVehicle(id) {
        const response = await this.makeRequest(`/vehicles/${id}`, {
            method: 'DELETE'
        });
        return response;
    },

    // HEALTH CHECK
    async healthCheck() {
        const response = await this.makeRequest('/health');
        return response;
    },

    // MEETING NOTES OPERATIONS
    async getMeetingNotes(monthKey = null) {
        const url = monthKey ? `/meeting-notes?monthKey=${monthKey}` : '/meeting-notes';
        const response = await this.makeRequest(url);
        return response;
    },

    async createMonthlyNotes(monthKey, monthlyGoals = '') {
        try {
            const response = await this.makeRequest('/meeting-notes', {
                method: 'POST',
                body: JSON.stringify({ monthKey, monthlyGoals })
            });
            return response;
        } catch (error) {
            const message = (error?.message || '').toLowerCase();
            if (message.includes('already exist')) {
                console.warn('⚠️ Monthly meeting notes already exist. Returning existing notes instead of throwing.');
                try {
                    const existing = await this.getMeetingNotes(monthKey);
                    if (existing?.data) {
                        existing.data.duplicate = true;
                    }
                    return existing;
                } catch (fetchError) {
                    console.error('❌ Failed to load existing monthly notes after duplicate detection:', fetchError);
                }
            }
            throw error;
        }
    },

    async updateMonthlyNotes(id, data) {
        const response = await this.makeRequest('/meeting-notes', {
            method: 'PUT',
            body: JSON.stringify({ id, ...data })
        });
        return response;
    },

    async deleteMonthlyNotes({ id = null, monthKey = null } = {}) {
        const params = new URLSearchParams();
        if (id) params.append('id', id);
        if (monthKey) params.append('monthKey', monthKey);
        const query = params.toString();
        if (!query) {
            throw new Error('id or monthKey is required to delete monthly meeting notes');
        }
        const response = await this.makeRequest(`/meeting-notes?${query}`, {
            method: 'DELETE'
        });
        return response;
    },

    async createWeeklyNotes(monthlyNotesId, weekKey, weekStart, weekEnd = null) {
        try {
            const response = await this.makeRequest('/meeting-notes?action=weekly', {
                method: 'POST',
                body: JSON.stringify({ monthlyNotesId, weekKey, weekStart, weekEnd })
            });
            return response;
        } catch (error) {
            const message = (error?.message || '').toLowerCase();
            if (message.includes('already exist')) {
                console.warn('⚠️ Weekly meeting notes already exist. Returning existing notes instead of throwing.');
                try {
                    const allNotesResponse = await this.makeRequest('/meeting-notes');
                    const monthlyNotes =
                        allNotesResponse?.data?.monthlyNotes ||
                        allNotesResponse?.monthlyNotes ||
                        [];
                    const parentNote = monthlyNotes.find(note => note?.id === monthlyNotesId || note?.weeklyNotes?.some(week => week?.weekKey === weekKey));
                    const existingWeek = parentNote?.weeklyNotes?.find(week => week?.weekKey === weekKey);
                    if (existingWeek) {
                        const duplicateResponse = {
                            data: {
                                weeklyNotes: existingWeek,
                                duplicate: true
                            },
                            duplicate: true
                        };
                        return duplicateResponse;
                    }
                } catch (fetchError) {
                    console.error('❌ Failed to load existing weekly notes after duplicate detection:', fetchError);
                }
            }
            throw error;
        }
    },

    async deleteWeeklyNotes(weeklyNotesId) {
        if (!weeklyNotesId) {
            throw new Error('weeklyNotesId is required to delete weekly meeting notes');
        }
        const response = await this.makeRequest(`/meeting-notes?action=weekly&id=${weeklyNotesId}`, {
            method: 'DELETE'
        });
        return response;
    },

    async updateDepartmentNotes(id, data) {
        const response = await this.makeRequest('/meeting-notes?action=department', {
            method: 'PUT',
            body: JSON.stringify({ id, ...data })
        });
        return response;
    },

    async createActionItem(data) {
        const response = await this.makeRequest('/meeting-notes?action=action-item', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        return response;
    },

    async updateActionItem(id, data) {
        const response = await this.makeRequest('/meeting-notes?action=action-item', {
            method: 'PUT',
            body: JSON.stringify({ id, ...data })
        });
        return response;
    },

    async deleteActionItem(id) {
        const response = await this.makeRequest(`/meeting-notes?action=action-item&id=${id}`, {
            method: 'DELETE'
        });
        return response;
    },

    async createComment(data) {
        const response = await this.makeRequest('/meeting-notes?action=comment', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        return response;
    },

    async deleteComment(commentId) {
        if (!commentId) {
            throw new Error('commentId is required to delete a comment');
        }
        const payload = {
            action: 'comment',
            id: commentId,
            commentId
        };
        const response = await this.makeRequest(`/meeting-notes?action=comment&id=${commentId}`, {
            method: 'DELETE',
            body: JSON.stringify(payload)
        });
        return response;
    },

    async updateUserAllocation(monthlyNotesId, departmentId, userId, role = 'contributor') {
        const response = await this.makeRequest('/meeting-notes?action=allocation', {
            method: 'POST',
            body: JSON.stringify({ monthlyNotesId, departmentId, userId, role })
        });
        return response;
    },

    async deleteUserAllocation(monthlyNotesId, departmentId, userId) {
        const response = await this.makeRequest(`/meeting-notes?action=allocation&monthlyNotesId=${monthlyNotesId}&departmentId=${departmentId}&userId=${userId}`, {
            method: 'DELETE'
        });
        return response;
    },

    async generateMonthlyPlan(monthKey, copyFromMonthKey = null) {
        try {
            const response = await this.makeRequest('/meeting-notes?action=generate-month', {
                method: 'POST',
                body: JSON.stringify({ monthKey, copyFromMonthKey })
            });
            return response;
        } catch (error) {
            const message = (error?.message || '').toLowerCase();
            if (message.includes('already exist')) {
                console.warn('⚠️ Monthly plan already exists. Returning existing notes instead of throwing.');
                try {
                    const existing = await this.getMeetingNotes(monthKey);
                    if (existing?.data) {
                        existing.data.duplicate = true;
                    }
                    return existing;
                } catch (fetchError) {
                    console.error('❌ Failed to load existing monthly plan after duplicate detection:', fetchError);
                }
            }
            throw error;
        }
    },

    async purgeMeetingNotes() {
        const response = await this.makeRequest('/meeting-notes?action=purge&confirm=true', {
            method: 'DELETE'
        });
        return response;
    },
    
    // Clear all caches - useful for forcing fresh data loads
    // Added throttling and batching to prevent excessive cache clearing
    _lastCacheClear: 0,
    _cacheClearThrottle: 2000, // Minimum 2 seconds between cache clears
    _pendingCacheClear: null,
    _cacheClearDebounceTimer: null,
    clearCache(endpoint = null) {
        const now = Date.now();
        const timeSinceLastClear = now - this._lastCacheClear;
        
        // If specific endpoint provided, use endpoint cache clearing instead
        if (endpoint) {
            return this.clearEndpointCache(endpoint);
        }
        
        // Throttle cache clearing to prevent excessive API calls
        if (timeSinceLastClear < this._cacheClearThrottle) {
            // Silently throttle - reduce log noise
            // Only log if it's been more than 5 seconds (unusual situation)
            if (timeSinceLastClear > 5000) {
                const waitTime = Math.round((this._cacheClearThrottle - timeSinceLastClear) / 1000);
                const log = window.debug?.log || (() => {});
                log(`⏸️ Cache clear throttled. Please wait ${waitTime}s before clearing again.`);
            }
            
            // Schedule a deferred clear for when throttle period expires
            if (!this._pendingCacheClear) {
                const waitTime = this._cacheClearThrottle - timeSinceLastClear;
                this._pendingCacheClear = setTimeout(() => {
                    this._pendingCacheClear = null;
                    this._lastCacheClear = Date.now();
                    this._performCacheClear();
                }, waitTime);
            }
            return 0;
        }
        
        // Clear any pending deferred clear
        if (this._pendingCacheClear) {
            clearTimeout(this._pendingCacheClear);
            this._pendingCacheClear = null;
        }
        
        this._lastCacheClear = now;
        return this._performCacheClear();
    },
    
    _performCacheClear() {
        const log = window.debug?.log || (() => {});
        log('🧹 Clearing DatabaseAPI caches...');
        let cleared = 0;
        
        if (this._responseCache) {
            cleared += this._responseCache.size;
            this._responseCache.clear();
        }
        
        if (this._pendingRequests) {
            cleared += this._pendingRequests.size;
            this._pendingRequests.clear();
        }
        
        if (this.cache) {
            cleared += this.cache.size;
            this.cache.clear();
        }
        
        log(`✅ DatabaseAPI cache cleared (${cleared} entries)`);
        return cleared;
    },
    
    // Clear cache for a specific endpoint
    // Added throttling to prevent excessive endpoint cache clearing
    clearEndpointCache(endpoint, method = 'GET') {
        const now = Date.now();
        const cacheKey = `${method.toUpperCase()}:${endpoint}`;
        const throttleKey = `clear_${cacheKey}`;
        
        // Check if we recently cleared this endpoint
        if (!this._endpointClearTimes) {
            this._endpointClearTimes = new Map();
        }
        
        const lastClear = this._endpointClearTimes.get(throttleKey) || 0;
        const timeSinceLastClear = now - lastClear;
        const endpointThrottle = 1000; // 1 second minimum between clears for same endpoint
        
        if (timeSinceLastClear < endpointThrottle) {
            // Silently skip if throttled (don't spam console)
            return 0;
        }
        
        this._endpointClearTimes.set(throttleKey, now);
        
        // Clean up old throttle entries (keep only last 100)
        if (this._endpointClearTimes.size > 100) {
            const entries = Array.from(this._endpointClearTimes.entries());
            entries.sort((a, b) => b[1] - a[1]); // Sort by timestamp, newest first
            this._endpointClearTimes = new Map(entries.slice(0, 100));
        }
        
        let cleared = 0;
        
        if (this._responseCache?.has(cacheKey)) {
            this._responseCache.delete(cacheKey);
            cleared++;
        }
        
        if (this._pendingRequests?.has(cacheKey)) {
            this._pendingRequests.delete(cacheKey);
            cleared++;
        }
        
        return cleared;
    }
};

// Make available globally
window.DatabaseAPI = DatabaseAPI;

// Check if we need to clear cache on load (set by early cache clearing script)
if (window.__CLEAR_DATABASE_CACHE_ON_LOAD__) {
    DatabaseAPI.clearCache();
    delete window.__CLEAR_DATABASE_CACHE_ON_LOAD__;
}

// Update the existing API object to use database operations
if (window.api) {
    // Replace existing API methods with database-first versions
    window.api.getClients = DatabaseAPI.getClients.bind(DatabaseAPI);
    window.api.createClient = DatabaseAPI.createClient.bind(DatabaseAPI);
    window.api.updateClient = DatabaseAPI.updateClient.bind(DatabaseAPI);
    window.api.deleteClient = DatabaseAPI.deleteClient.bind(DatabaseAPI);
    
    window.api.getLeads = DatabaseAPI.getLeads.bind(DatabaseAPI);
    window.api.createLead = DatabaseAPI.createLead.bind(DatabaseAPI);
    window.api.updateLead = DatabaseAPI.updateLead.bind(DatabaseAPI);
    window.api.deleteLead = DatabaseAPI.deleteLead.bind(DatabaseAPI);
    
    window.api.getProjects = DatabaseAPI.getProjects.bind(DatabaseAPI);
    window.api.getProject = DatabaseAPI.getProject.bind(DatabaseAPI);
    window.api.createProject = DatabaseAPI.createProject.bind(DatabaseAPI);
    window.api.updateProject = DatabaseAPI.updateProject.bind(DatabaseAPI);
    window.api.deleteProject = DatabaseAPI.deleteProject.bind(DatabaseAPI);
    
    window.api.getInvoices = DatabaseAPI.getInvoices.bind(DatabaseAPI);
    window.api.createInvoice = DatabaseAPI.createInvoice.bind(DatabaseAPI);
    window.api.updateInvoice = DatabaseAPI.updateInvoice.bind(DatabaseAPI);
    window.api.deleteInvoice = DatabaseAPI.deleteInvoice.bind(DatabaseAPI);
    
    window.api.getTimeEntries = DatabaseAPI.getTimeEntries.bind(DatabaseAPI);
    window.api.createTimeEntry = DatabaseAPI.createTimeEntry.bind(DatabaseAPI);
    window.api.updateTimeEntry = DatabaseAPI.updateTimeEntry.bind(DatabaseAPI);
    window.api.deleteTimeEntry = DatabaseAPI.deleteTimeEntry.bind(DatabaseAPI);
    
    window.api.getUsers = DatabaseAPI.getUsers.bind(DatabaseAPI);
    window.api.inviteUser = DatabaseAPI.inviteUser.bind(DatabaseAPI);
    
    window.api.getSettings = DatabaseAPI.getSettings.bind(DatabaseAPI);
    window.api.updateSettings = DatabaseAPI.updateSettings.bind(DatabaseAPI);
    
    window.api.bulkUpdateClients = DatabaseAPI.bulkUpdateClients.bind(DatabaseAPI);
    window.api.bulkDeleteClients = DatabaseAPI.bulkDeleteClients.bind(DatabaseAPI);
    
    window.api.searchClients = DatabaseAPI.searchClients.bind(DatabaseAPI);
    window.api.searchLeads = DatabaseAPI.searchLeads.bind(DatabaseAPI);
    
    window.api.getClientAnalytics = DatabaseAPI.getClientAnalytics.bind(DatabaseAPI);
    window.api.getLeadAnalytics = DatabaseAPI.getLeadAnalytics.bind(DatabaseAPI);
    window.api.getRevenueAnalytics = DatabaseAPI.getRevenueAnalytics.bind(DatabaseAPI);
    
    // Starred clients API methods
    window.api.starClient = DatabaseAPI.starClient.bind(DatabaseAPI);
    window.api.unstarClient = DatabaseAPI.unstarClient.bind(DatabaseAPI);
    window.api.toggleStarClient = DatabaseAPI.toggleStarClient.bind(DatabaseAPI);
    window.api.getStarredClients = DatabaseAPI.getStarredClients.bind(DatabaseAPI);
    
    // Starred opportunities API methods
    window.api.starOpportunity = DatabaseAPI.starOpportunity.bind(DatabaseAPI);
    window.api.unstarOpportunity = DatabaseAPI.unstarOpportunity.bind(DatabaseAPI);
    window.api.toggleStarOpportunity = DatabaseAPI.toggleStarOpportunity.bind(DatabaseAPI);
    window.api.getStarredOpportunities = DatabaseAPI.getStarredOpportunities.bind(DatabaseAPI);
    
    // Opportunities API methods
    window.api.getOpportunities = DatabaseAPI.getOpportunities.bind(DatabaseAPI);
    window.api.getOpportunitiesByClient = DatabaseAPI.getOpportunitiesByClient.bind(DatabaseAPI);
    window.api.getOpportunity = DatabaseAPI.getOpportunity.bind(DatabaseAPI);
    window.api.createOpportunity = DatabaseAPI.createOpportunity.bind(DatabaseAPI);
    window.api.updateOpportunity = DatabaseAPI.updateOpportunity.bind(DatabaseAPI);
    window.api.deleteOpportunity = DatabaseAPI.deleteOpportunity.bind(DatabaseAPI);
    
    window.api.healthCheck = DatabaseAPI.healthCheck.bind(DatabaseAPI);
}
