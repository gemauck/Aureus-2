const API_BASE = (() => {
    // Always use the current origin; works for localhost on any port and production
    return window.location.origin + '/api'
})()

// Global rate limit state management to prevent cascade of requests
const RateLimitManager = {
  _rateLimitActive: false,
  _rateLimitResumeAt: 0,
  _consecutiveRateLimitErrors: 0,
  _requestQueue: [],
  _processingQueue: false,
  _lastRequestTime: 0,
  _minRequestInterval: 300, // Minimum 300ms between requests to prevent bursts (increased from 100ms)
  _pendingBatches: new Map(), // Track pending batched requests
  _batchDelay: 50, // Wait 50ms to batch similar requests together
  
  isRateLimited() {
    if (!this._rateLimitActive) return false
    if (Date.now() >= this._rateLimitResumeAt) {
      this._rateLimitActive = false
      this._consecutiveRateLimitErrors = 0
      return false
    }
    return true
  },
  
  setRateLimit(retryAfterSeconds) {
    this._rateLimitActive = true
    // Add buffer time - retry after the specified time plus a small buffer
    const bufferSeconds = Math.min(retryAfterSeconds * 0.1, 60) // 10% buffer, max 60s
    this._rateLimitResumeAt = Date.now() + (retryAfterSeconds + bufferSeconds) * 1000
    this._consecutiveRateLimitErrors += 1
    
    const waitMinutes = Math.round((retryAfterSeconds + bufferSeconds) / 60)
    console.warn(`🚫 Rate limit active. Waiting ${waitMinutes} minute(s) before allowing new requests...`)
    
    // If we've hit rate limits multiple times, extend the wait period
    if (this._consecutiveRateLimitErrors >= 3) {
      const extendedWait = retryAfterSeconds * 2 // Double the wait time
      this._rateLimitResumeAt = Date.now() + extendedWait * 1000
      console.warn(`⚠️ Multiple rate limit errors detected. Extending wait time to ${Math.round(extendedWait / 60)} minute(s).`)
    }
  },
  
  clearRateLimit() {
    this._rateLimitActive = false
    this._rateLimitResumeAt = 0
    // Process any queued requests when rate limit clears
    this._processQueue()
  },
  
  getWaitTimeRemaining() {
    if (!this._rateLimitActive) return 0
    const remaining = Math.max(0, this._rateLimitResumeAt - Date.now())
    return Math.round(remaining / 1000) // Return seconds
  },
  
  // Throttle requests to prevent bursts
  async throttleRequest(requestFn, priority = 0) {
    // If rate limited, queue the request
    if (this.isRateLimited()) {
      return new Promise((resolve, reject) => {
        this._requestQueue.push({ requestFn, resolve, reject, priority })
        // Sort queue by priority (higher priority first)
        this._requestQueue.sort((a, b) => b.priority - a.priority)
      })
    }
    
    // Enforce minimum interval between requests
    const now = Date.now()
    const timeSinceLastRequest = now - this._lastRequestTime
    if (timeSinceLastRequest < this._minRequestInterval) {
      await new Promise(resolve => setTimeout(resolve, this._minRequestInterval - timeSinceLastRequest))
    }
    
    this._lastRequestTime = Date.now()
    
    try {
      const result = await requestFn()
      // Process queue after successful request
      this._processQueue()
      return result
    } catch (error) {
      // If rate limited, queue the request for retry
      if (error.status === 429 || error.code === 'RATE_LIMIT_EXCEEDED') {
        return new Promise((resolve, reject) => {
          this._requestQueue.push({ requestFn, resolve, reject, priority })
          this._requestQueue.sort((a, b) => b.priority - a.priority)
        })
      }
      throw error
    }
  },
  
  // Process queued requests when rate limit is not active
  async _processQueue() {
    if (this._processingQueue || this.isRateLimited() || this._requestQueue.length === 0) {
      return
    }
    
    this._processingQueue = true
    
    while (this._requestQueue.length > 0 && !this.isRateLimited()) {
      const { requestFn, resolve, reject } = this._requestQueue.shift()
      
      // Enforce minimum interval
      const now = Date.now()
      const timeSinceLastRequest = now - this._lastRequestTime
      if (timeSinceLastRequest < this._minRequestInterval) {
        await new Promise(r => setTimeout(r, this._minRequestInterval - timeSinceLastRequest))
      }
      
      this._lastRequestTime = Date.now()
      
      try {
        const result = await requestFn()
        resolve(result)
      } catch (error) {
        if (error.status === 429 || error.code === 'RATE_LIMIT_EXCEEDED') {
          // Re-queue if rate limited again
          this._requestQueue.unshift({ requestFn, resolve, reject, priority: 0 })
          this._processingQueue = false
          return
        }
        reject(error)
      }
    }
    
    this._processingQueue = false
  },
  
  // Clear the request queue
  clearQueue() {
    this._requestQueue.forEach(({ reject }) => {
      reject(new Error('Request queue cleared due to rate limit'))
    })
    this._requestQueue = []
  },
  
  // Batch similar requests together to prevent duplicate API calls
  async batchRequest(requestKey, requestFn, priority = 0) {
    // If there's already a pending request for this key, return the same promise
    if (this._pendingBatches.has(requestKey)) {
      return this._pendingBatches.get(requestKey)
    }
    
    // Create a new batched request
    const batchedPromise = this.throttleRequest(requestFn, priority)
      .finally(() => {
        // Clean up after request completes (success or failure)
        setTimeout(() => {
          this._pendingBatches.delete(requestKey)
        }, this._batchDelay)
      })
    
    this._pendingBatches.set(requestKey, batchedPromise)
    return batchedPromise
  }
}

async function request(path, options = {}) {
  // Use throttling for all requests to prevent bursts
  return RateLimitManager.throttleRequest(async () => {
    // Check if we're currently rate limited before making any request
    if (RateLimitManager.isRateLimited()) {
      const waitSeconds = RateLimitManager.getWaitTimeRemaining()
      const waitMinutes = Math.round(waitSeconds / 60)
      const error = new Error(`Rate limit active. Please wait ${waitMinutes} minute(s) before trying again.`)
      error.status = 429
      error.code = 'RATE_LIMIT_EXCEEDED'
      error.retryAfter = waitSeconds
      throw error
    }
    
    const token = window.storage?.getToken?.()
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
    if (token) headers['Authorization'] = `Bearer ${token}`

    const fullUrl = `${API_BASE}${path}`
    const requestOptions = { ...options, headers, credentials: 'include' }

  const execute = async () => {
    // Add timeout handling using AbortController
    const timeoutMs = options.timeout || 30000; // Default 30 seconds, configurable
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    
    // Add abort signal to request options
    requestOptions.signal = controller.signal;
    
    try {
      const res = await fetch(fullUrl, requestOptions);
      clearTimeout(timeoutId);
      const text = await res.text();

    // Handle 429 rate limit errors FIRST before trying to parse JSON
    // Server returns plain text "Too many requests, please slow down..." which is not JSON
    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After') || '900' // Default to 15 minutes
      let errorMessage = 'Too many requests. Please wait before trying again.'
      
      // Try to parse as JSON, but fall back to plain text if it fails
      try {
        const jsonData = text ? JSON.parse(text) : {}
        errorMessage = jsonData?.error?.message || jsonData?.message || errorMessage
      } catch (_) {
        // If parsing fails, use the plain text response (common for 429 errors)
        errorMessage = text.trim() || errorMessage
      }
      
      // Set global rate limit state to prevent other requests
      const retryAfterSeconds = parseInt(retryAfter, 10)
      RateLimitManager.setRateLimit(retryAfterSeconds)
      
      const rateLimitError = new Error(errorMessage)
      rateLimitError.status = 429
      rateLimitError.retryAfter = retryAfterSeconds
      rateLimitError.code = 'RATE_LIMIT_EXCEEDED'
      throw rateLimitError
    }

    // Check for gateway errors (502, 503, 504) that return HTML
    if (!res.ok && (res.status === 502 || res.status === 503 || res.status === 504)) {
      const gatewayError = new Error(`Server unavailable (${res.status}): The server is temporarily unavailable. Please try again later.`);
      gatewayError.status = res.status;
      throw gatewayError; // Throw immediately so it can be caught and handled
    }

    let data = {}
    if (text) {
      try {
        data = JSON.parse(text)
      } catch (parseError) {
        // Check if response is HTML (common for 502/503/504 gateway errors)
        if (text.trim().startsWith('<') || text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<!doctype')) {
          // If it's a gateway error, throw a more specific error
          if (res.status === 502 || res.status === 503 || res.status === 504) {
            const gatewayError = new Error(`Server unavailable (${res.status}): The server is temporarily unavailable. Please try again later.`);
            gatewayError.status = res.status;
            throw gatewayError;
          }
          throw new Error(`Server returned HTML instead of JSON. This usually means the API endpoint doesn't exist or there's a server error. Response: ${text.substring(0, 100)}...`)
        } else {
          throw new Error(`Invalid JSON response: ${parseError.message}. Response: ${text.substring(0, 100)}...`)
        }
      }
    }

      return { res, data };
    } catch (error) {
      clearTimeout(timeoutId);
      
      // Handle timeout errors specifically
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        const timeoutError = new Error(`Request timeout after ${timeoutMs}ms: ${path}`);
        timeoutError.name = 'TimeoutError';
        timeoutError.isTimeout = true;
        throw timeoutError;
      }
      
      // Re-throw other errors
      throw error;
    }
  }

  try {
    let { res, data } = await execute()

    // Only try to refresh token for 401 errors, but NOT for login/auth endpoints
    // Login endpoints should fail immediately without refresh attempts
    const isAuthEndpoint = path === '/auth/login' || path === '/login' || path === '/auth/2fa/verify'
    if (!res.ok && res.status === 401 && !isAuthEndpoint) {
      // Try refresh once for non-auth endpoints
      const refreshed = await api.refresh?.()
      if (refreshed?.data?.accessToken || refreshed?.accessToken) {
        // Update Authorization header and retry
        const newToken = refreshed.data?.accessToken || refreshed.accessToken
        if (newToken) {
          if (window.storage?.setToken) window.storage.setToken(newToken)
          requestOptions.headers = { ...requestOptions.headers, Authorization: `Bearer ${newToken}` }
        }
        ({ res, data } = await execute())
      }
    }

    if (!res.ok) {
      // 429 errors are already handled in execute() function above
      // This code path shouldn't be reached for 429 errors, but keeping for safety
      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After') || data?.retryAfter || 900 // Default to 15 minutes
        const errorMessage = data?.error?.message || data?.message || 'Too many requests. Please wait before trying again.'
        // Set global rate limit state to prevent other requests
        const retryAfterSeconds = parseInt(retryAfter, 10)
        RateLimitManager.setRateLimit(retryAfterSeconds)
        
        const rateLimitError = new Error(errorMessage)
        rateLimitError.status = 429
        rateLimitError.retryAfter = retryAfterSeconds
        rateLimitError.code = 'RATE_LIMIT_EXCEEDED'
        throw rateLimitError
      }
      
      // Handle 401 errors
      if (res.status === 401) {
        // Any unauthorized after optional refresh -> force logout and redirect
        if (!isAuthEndpoint && path !== '/auth/login' && path !== '/login') {
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
        }
      }
      // Extract error details if available
      const errorCode = data?.error?.code;
      const errorMessage = data?.error?.message || data?.message;
      const errorDetails = data?.error?.details;
      
      // Handle database connection errors with user-friendly messages
      if (errorCode === 'DATABASE_CONNECTION_ERROR' || errorMessage?.includes('Database connection failed') || errorMessage?.includes('unreachable')) {
        // Suppress database connection error logs - they're expected when DB is unreachable
        // The error is still thrown for proper error handling, just not logged
        throw new Error(`Database connection failed. The database server is unreachable. Please contact support if this issue persists.`);
      }
      
      // Handle 500 errors gracefully - suppress console errors for expected server failures
      if (res.status === 500) {
        // Include "500" in the error message so catch block can recognize it as server error
        const serverErrorMessage = errorMessage || 'Server error 500: The server encountered an error processing your request.';
        throw new Error(serverErrorMessage);
      }
      
      // Handle 502/503/504 gateway errors gracefully
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        const gatewayErrorMessage = errorMessage || `Server unavailable (${res.status}): The server is temporarily unavailable. Please try again later.`;
        throw new Error(gatewayErrorMessage);
      }
      
      // For heartbeat endpoint, suppress "Invalid method" errors (they're expected if server hasn't updated)
      if (path === '/users/heartbeat' && errorMessage?.includes('Invalid method')) {
        return null; // Silently ignore heartbeat method errors
      }
      
      throw new Error(errorMessage || `Request failed with status ${res.status}`)
    }

    return data
  } catch (error) {
    // Check if it's a database connection error, server error, or rate limit error - suppress logs for these
    const errorMessage = error?.message || String(error);
    const isDatabaseError = errorMessage.includes('Database connection failed') ||
                          errorMessage.includes('unreachable') ||
                          errorMessage.includes('ECONNREFUSED') ||
                          errorMessage.includes('ETIMEDOUT');
    const isServerError = errorMessage.includes('500') || 
                         errorMessage.includes('502') || 
                         errorMessage.includes('503') || 
                         errorMessage.includes('504');
    const isRateLimitError = error?.status === 429 || error?.code === 'RATE_LIMIT_EXCEEDED';
    
    // Handle rate limit errors - don't retry, just throw
    if (isRateLimitError) {
      // Rate limit errors are already logged by RateLimitManager.setRateLimit()
      // Don't log again to avoid spam
      throw error;
    }
    
    // Suppress error logs for server errors and database errors (they're expected when backend/DB is down)
    if (!isDatabaseError && !isServerError) {
      console.error('❌ Fetch Error:', { path, error: error.message, stack: error.stack });
    }
    throw error;
  }
}

// Initial load coordinator to stagger component mounts
const InitialLoadCoordinator = {
  _componentLoadCount: 0,
  _baseDelay: 50, // Base delay between component loads
  
  // Get a staggered delay for component initialization
  getStaggeredDelay() {
    const delay = this._componentLoadCount * this._baseDelay;
    this._componentLoadCount += 1;
    // Reset after a reasonable number to prevent infinite growth
    if (this._componentLoadCount > 100) {
      this._componentLoadCount = 0;
    }
    return delay;
  },
  
  // Reset the counter (useful for testing or page reloads)
  reset() {
    this._componentLoadCount = 0;
  }
};

// Expose rate limit manager and initial load coordinator globally for debugging
window.RateLimitManager = RateLimitManager;
window.InitialLoadCoordinator = InitialLoadCoordinator;

const api = {
  // Auth
  async login(email, password) {
    // Use auth namespaced login so refresh cookie has proper Secure flag in production
    const res = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
    // Handle both response formats: production (accessToken) and local (data.accessToken)
    if (res?.accessToken) {
      window.storage.setToken(res.accessToken)
    } else if (res?.data?.accessToken) {
      window.storage.setToken(res.data.accessToken)
    }
    return res
  },
  
  async me() {
    const res = await request('/me')
    return res
  },
  
  async refresh() {
    try {
      // Use direct fetch to avoid request() error logging
      const fullUrl = `${API_BASE}/auth/refresh`
      const res = await fetch(fullUrl, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (!res.ok) {
        // Expected failure when no refresh cookie - return null silently
        return null
      }
      
      const text = await res.text()
      const data = text ? JSON.parse(text) : {}
      
      if (data?.data?.accessToken) {
        window.storage.setToken(data.data.accessToken)
      }
      return data
    } catch (error) {
      // Silently fail - expected when no refresh cookie exists
      return null
    }
  },
  
  async logout() {
    const res = await request('/auth/logout', { method: 'POST' })
    if (window.storage.removeToken) window.storage.removeToken()
    return res
  },

  async requestPasswordReset(email) {
    const res = await request('/auth/request-password-reset', {
      method: 'POST',
      body: JSON.stringify({ email })
    })
    return res
  },

  async resetPassword(token, password) {
    const res = await request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password })
    })
    return res
  },

  // Heartbeat to track online status
  async heartbeat() {
    try {
      const res = await request('/users/heartbeat', { method: 'POST' })
      return res
    } catch (error) {
      // Silently fail heartbeat errors to avoid console spam
      // Don't log 401/404/500/502/503/504/400 errors or database errors as they're expected when auth is in flux or server hasn't updated or DB is down
      const errorMessage = error.message || '';
      const errorStatus = error.status || '';
      const isDatabaseError = errorMessage.includes('Database connection failed') ||
                            errorMessage.includes('unreachable');
      const isServerError = errorMessage.includes('500') || 
                           errorMessage.includes('502') || 
                           errorMessage.includes('503') || 
                           errorMessage.includes('504') ||
                           errorMessage.includes('Server unavailable');
      const isAuthError = errorMessage.includes('401') || 
                         errorMessage.includes('404') || 
                         errorMessage.includes('Unauthorized') ||
                         errorMessage.includes('token may be invalid') ||
                         errorStatus === 401 ||
                         errorStatus === 404;
      
      // Only log unexpected errors (not auth, server, or database errors)
      if (errorMessage && 
          !isAuthError &&
          !errorMessage.includes('500') && 
          !errorMessage.includes('502') &&
          !errorMessage.includes('503') &&
          !errorMessage.includes('504') &&
          !errorMessage.includes('400') &&
          !errorMessage.includes('Invalid method') &&
          !errorMessage.includes('Failed to update') &&
          !errorMessage.includes('Server unavailable') &&
          !isDatabaseError &&
          !isServerError) {
        console.warn('Heartbeat failed:', errorMessage)
      }
      return null
    }
  },

  // Clients
  async listClients() {
    const res = await request('/clients')
    return res
  },

  async getClients() {
    const res = await request('/clients')
    return res
  },

  async createClient(clientData) {
    const res = await request('/clients', { method: 'POST', body: JSON.stringify(clientData) })
    return res
  },

  async updateClient(id, clientData) {
    const res = await request(`/clients/${id}`, { method: 'PATCH', body: JSON.stringify(clientData) })
    return res
  },

  async deleteClient(id) {
    const res = await request(`/clients/${id}`, { method: 'DELETE' })
    return res
  },

  async getClient(id) {
    const res = await request(`/clients/${id}`)
    return res
  },

  // Leads
  async listLeads() {
    const res = await request('/leads')
    return res
  },

  async getLeads() {
    const res = await request('/leads')
    return res
  },

  async createLead(leadData) {
    const res = await request('/leads', { method: 'POST', body: JSON.stringify(leadData) })
    return res
  },

  async updateLead(id, leadData) {
    const res = await request(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify(leadData) })
    return res
  },

  async deleteLead(id) {
    const res = await request(`/leads/${id}`, { method: 'DELETE' })
    return res
  },

  async getLead(id) {
    const res = await request(`/leads/${id}`)
    return res
  },

  // Projects
  async listProjects() {
    const res = await request('/projects')
    return res
  },

  async getProjects() {
    const res = await request('/projects')
    return res
  },

  async createProject(projectData) {
    const res = await request('/projects', { method: 'POST', body: JSON.stringify(projectData) })
    return res
  },

  async updateProject(id, projectData) {
    const res = await request(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(projectData) })
    return res
  },

  async deleteProject(id) {
    const res = await request(`/projects/${id}`, { method: 'DELETE' })
    return res
  },

  async getProject(id) {
    const res = await request(`/projects/${id}`)
    return res
  },

  // Employees
  async listEmployees() {
    const res = await request('/employees')
    return res
  },

  async getEmployees() {
    const res = await request('/employees')
    return res
  },

  async createEmployee(employeeData) {
    const res = await request('/employees', { method: 'POST', body: JSON.stringify(employeeData) })
    return res
  },

  async updateEmployee(id, employeeData) {
    const res = await request(`/employees/${id}`, { method: 'PATCH', body: JSON.stringify(employeeData) })
    return res
  },

  async deleteEmployee(id) {
    const res = await request(`/employees/${id}`, { method: 'DELETE' })
    return res
  },

  async getEmployee(id) {
    const res = await request(`/employees/${id}`)
    return res
  },

  // Time Entries
  async listTimeEntries() {
    const res = await request('/time-entries')
    return res
  },

  async createTimeEntry(timeEntryData) {
    const res = await request('/time-entries', { method: 'POST', body: JSON.stringify(timeEntryData) })
    return res
  },

  async updateTimeEntry(id, timeEntryData) {
    const res = await request(`/time-entries/${id}`, { method: 'PUT', body: JSON.stringify(timeEntryData) })
    return res
  },

  async deleteTimeEntry(id) {
    const res = await request(`/time-entries/${id}`, { method: 'DELETE' })
    return res
  },

  async getTimeEntry(id) {
    const res = await request(`/time-entries/${id}`)
    return res
  },

  // Opportunities
  async listOpportunities() {
    const res = await request('/opportunities')
    return res
  },
  async createOpportunity(opportunityData) {
    const res = await request('/opportunities', { method: 'POST', body: JSON.stringify(opportunityData) })
    return res
  },
  async updateOpportunity(id, opportunityData) {
    const res = await request(`/opportunities/${id}`, { method: 'PUT', body: JSON.stringify(opportunityData) })
    return res
  },
  async deleteOpportunity(id) {
    const res = await request(`/opportunities/${id}`, { method: 'DELETE' })
    return res
  },
  async getOpportunity(id) {
    const res = await request(`/opportunities/${id}`)
    return res
  },
  async getOpportunitiesByClient(clientId) {
    const res = await request(`/opportunities/client/${clientId}`)
    return res
  },

  // Contacts
  async getContacts(clientId) {
    const res = await request(`/contacts/client/${clientId}`)
    return res
  },
  async createContact(clientId, contactData) {
    const res = await request(`/contacts/client/${clientId}`, { method: 'POST', body: JSON.stringify(contactData) })
    return res
  },
  async updateContact(clientId, contactId, contactData) {
    const res = await request(`/contacts/client/${clientId}/${contactId}`, { method: 'PATCH', body: JSON.stringify(contactData) })
    return res
  },
  async deleteContact(clientId, contactId) {
    const res = await request(`/contacts/client/${clientId}/${contactId}`, { method: 'DELETE' })
    return res
  },

  // Sites
  async getSites(clientId) {
    const res = await request(`/sites/client/${clientId}`)
    return res
  },
  async createSite(clientId, siteData) {
    const res = await request(`/sites/client/${clientId}`, { method: 'POST', body: JSON.stringify(siteData) })
    return res
  },
  async updateSite(clientId, siteId, siteData) {
    const res = await request(`/sites/client/${clientId}/${siteId}`, { method: 'PATCH', body: JSON.stringify(siteData) })
    return res
  },
  async deleteSite(clientId, siteId) {
    const res = await request(`/sites/client/${clientId}/${siteId}`, { method: 'DELETE' })
    return res
  },

  // Feedback/Comments
  async getFeedback(options = {}) {
    const params = new URLSearchParams()
    if (options.pageUrl) params.append('pageUrl', options.pageUrl)
    if (options.section) params.append('section', options.section)
    if (options.includeUser) params.append('includeUser', 'true')
    if (options.includeReplies) params.append('includeReplies', 'true')
    
    const query = params.toString()
    const res = await request(`/feedback${query ? `?${query}` : ''}`)
    return res
  },

  async submitFeedback(data) {
    const res = await request('/feedback', { 
      method: 'POST', 
      body: JSON.stringify(data) 
    })
    return res
  },

  async replyToFeedback(feedbackId, data) {
    if (!feedbackId) {
      throw new Error('feedbackId is required to reply')
    }

    const res = await request(`/feedback/${feedbackId}/replies`, {
      method: 'POST',
      body: JSON.stringify(data)
    })
    return res
  },

  // Job Cards
  async getJobCards() {
    const res = await request('/jobcards')
    return res
  },

  async getJobCard(id) {
    const res = await request(`/jobcards/${id}`)
    return res
  },

  async createJobCard(jobCardData) {
    const res = await request('/jobcards', { method: 'POST', body: JSON.stringify(jobCardData) })
    return res
  },

  async updateJobCard(id, jobCardData) {
    const res = await request(`/jobcards/${id}`, { method: 'PATCH', body: JSON.stringify(jobCardData) })
    return res
  },

  async deleteJobCard(id) {
    const res = await request(`/jobcards/${id}`, { method: 'DELETE' })
    return res
  },
}

// Expose globally for prototype
window.api = api

// Debug function to check if API is loaded
window.debugAPI = () => {
}
