const API_BASE = (() => {
    // Always use the current origin; works for localhost on any port and production
    return window.location.origin + '/api'
})()

async function request(path, options = {}) {
  const token = window.storage?.getToken?.()
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const fullUrl = `${API_BASE}${path}`
  const requestOptions = { ...options, headers, credentials: 'include' }

  const execute = async () => {
    const res = await fetch(fullUrl, requestOptions)
    const text = await res.text()

    let data = {}
    if (text) {
      try {
        data = JSON.parse(text)
      } catch (parseError) {
        console.error('❌ JSON Parse Error:', { path, error: parseError.message, textPreview: text.substring(0, 200) });
        if (text.trim().startsWith('<')) {
          throw new Error(`Server returned HTML instead of JSON. This usually means the API endpoint doesn't exist or there's a server error. Response: ${text.substring(0, 100)}...`)
        } else {
          throw new Error(`Invalid JSON response: ${parseError.message}. Response: ${text.substring(0, 100)}...`)
        }
      }
    }

    return { res, data }
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
      // Handle rate limiting (429) specifically
      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After') || data?.retryAfter || 900 // Default to 15 minutes
        const errorMessage = data?.error?.message || data?.message || 'Too many requests. Please wait before trying again.'
        const rateLimitError = new Error(errorMessage)
        rateLimitError.status = 429
        rateLimitError.retryAfter = parseInt(retryAfter, 10)
        rateLimitError.code = 'RATE_LIMIT_EXCEEDED'
        throw rateLimitError
      }
      
      // Handle 401 errors
      if (res.status === 401) {
        const permissionLikely = path.startsWith('/users') || path.startsWith('/admin')
        const isCoreAuthEndpoint = path === '/me' || path === '/auth/refresh'
        // Only clear tokens and redirect for core auth endpoints, not for login failures
        if ((isCoreAuthEndpoint || (!isAuthEndpoint && !permissionLikely)) && path !== '/auth/login' && path !== '/login') {
          // Token likely invalid and refresh failed → clear and redirect
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
      
      // For heartbeat endpoint, suppress "Invalid method" errors (they're expected if server hasn't updated)
      if (path === '/users/heartbeat' && errorMessage?.includes('Invalid method')) {
        return null; // Silently ignore heartbeat method errors
      }
      
      throw new Error(errorMessage || `Request failed with status ${res.status}`)
    }

    return data
  } catch (error) {
    // Check if it's a database connection error or server error (500, 502, 503, 504) - suppress logs for these
    const errorMessage = error?.message || String(error);
    const isDatabaseError = errorMessage.includes('Database connection failed') ||
                          errorMessage.includes('unreachable') ||
                          errorMessage.includes('ECONNREFUSED') ||
                          errorMessage.includes('ETIMEDOUT');
    const isServerError = errorMessage.includes('500') || 
                         errorMessage.includes('502') || 
                         errorMessage.includes('503') || 
                         errorMessage.includes('504');
    
    // Suppress error logs for server errors and database errors (they're expected when backend/DB is down)
    if (!isDatabaseError && !isServerError) {
      console.error('❌ Fetch Error:', { path, error: error.message, stack: error.stack });
    }
    throw error;
  }
}

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
      // Don't log 401/500/400 errors or database errors as they're expected when auth is in flux or server hasn't updated or DB is down
      const errorMessage = error.message || '';
      const isDatabaseError = errorMessage.includes('Database connection failed') ||
                            errorMessage.includes('unreachable');
      
      if (errorMessage && 
          !errorMessage.includes('401') && 
          !errorMessage.includes('500') && 
          !errorMessage.includes('400') &&
          !errorMessage.includes('Invalid method') &&
          !errorMessage.includes('Failed to update') &&
          !isDatabaseError) {
        console.warn('Heartbeat failed:', errorMessage)
      }
      return null
    }
  },

  // Clients
  async listClients() {
    const res = await request('/clients')
    console.log('🔍 listClients response:', JSON.stringify(res, null, 2))
    return res
  },

  async getClients() {
    const res = await request('/clients')
    return res
  },

  async createClient(clientData) {
    console.log('🔍 Creating client with data:', clientData)
    const res = await request('/clients', { method: 'POST', body: JSON.stringify(clientData) })
    console.log('🔍 createClient response:', JSON.stringify(res, null, 2))
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
  console.log('🔍 API Debug:', {
    hasUpdateClient: typeof window.api.updateClient === 'function',
    hasCreateClient: typeof window.api.createClient === 'function',
    hasListClients: typeof window.api.listClients === 'function',
    hasCreateLead: typeof window.api.createLead === 'function',
    hasUpdateLead: typeof window.api.updateLead === 'function',
    hasListLeads: typeof window.api.listLeads === 'function',
    hasCreateEmployee: typeof window.api.createEmployee === 'function',
    hasUpdateEmployee: typeof window.api.updateEmployee === 'function',
    hasListEmployees: typeof window.api.listEmployees === 'function',
    hasCreateOpportunity: typeof window.api.createOpportunity === 'function',
    hasUpdateOpportunity: typeof window.api.updateOpportunity === 'function',
    hasListOpportunities: typeof window.api.listOpportunities === 'function',
    apiMethods: Object.keys(window.api)
  })
}
