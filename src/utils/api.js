const API_BASE = (() => {
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    const apiBase = isLocalhost ? 'http://localhost:3000/api' : window.location.origin + '/api';
    console.log('🔧 API Base URL:', { hostname, isLocalhost, apiBase });
    return apiBase;
})()

async function request(path, options = {}) {
  const token = window.storage?.getToken?.()
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (token) headers['Authorization'] = `Bearer ${token}`
  
  console.log('🌐 API Request:', { 
    path, 
    method: options.method || 'GET', 
    headers,
    hasToken: !!token,
    tokenPreview: token ? token.substring(0, 20) + '...' : 'none'
  });
  
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  const text = await res.text()
  
  console.log('📡 API Raw Response:', { path, status: res.status, ok: res.ok, textPreview: text.substring(0, 200) });
  
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
  
  console.log('📡 API Response:', { path, status: res.status, ok: res.ok, data });
  
        if (!res.ok) {
            console.error('❌ API Error:', { path, status: res.status, error: data?.error });
            
            // Handle specific error cases
            if (res.status === 401) {
                console.log('🔑 Unauthorized - clearing token');
                if (window.storage?.removeToken) window.storage.removeToken();
                if (window.storage?.removeUser) window.storage.removeUser();
            }
            
            throw new Error(data?.error?.message || `Request failed with status ${res.status}`)
        }
  return data
}

const api = {
  // Auth
  async login(email, password) {
    const res = await request('/login', { method: 'POST', body: JSON.stringify({ email, password }) })
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
    const res = await request('/auth/refresh', { 
      method: 'POST'
    })
    if (res?.data?.accessToken) window.storage.setToken(res.data.accessToken)
    return res
  },
  
  async logout() {
    const res = await request('/auth/logout', { method: 'POST' })
    if (window.storage.removeToken) window.storage.removeToken()
    return res
  },

  // Clients
  async listClients() {
    const res = await request('/clients')
    return res
  },

  async createClient(clientData) {
    console.log('🚀 API createClient called with:', clientData);
    const res = await request('/clients', { method: 'POST', body: JSON.stringify(clientData) })
    console.log('📡 API createClient response:', res);
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

  async createLead(leadData) {
    console.log('🚀 API createLead called with:', leadData);
    const res = await request('/leads', { method: 'POST', body: JSON.stringify(leadData) })
    console.log('📡 API createLead response:', res);
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

  async createProject(projectData) {
    console.log('🚀 API createProject called with:', projectData);
    const res = await request('/projects', { method: 'POST', body: JSON.stringify(projectData) })
    console.log('📡 API createProject response:', res);
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

  // Time Entries
  async listTimeEntries() {
    const res = await request('/time-entries')
    return res
  },

  async createTimeEntry(timeEntryData) {
    console.log('🚀 API createTimeEntry called with:', timeEntryData);
    const res = await request('/time-entries', { method: 'POST', body: JSON.stringify(timeEntryData) })
    console.log('📡 API createTimeEntry response:', res);
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
    console.log('🚀 API createOpportunity called with:', opportunityData);
    console.log('🔍 Opportunity data details:', {
      title: opportunityData.title,
      clientId: opportunityData.clientId,
      stage: opportunityData.stage,
      value: opportunityData.value,
      hasTitle: !!opportunityData.title,
      titleType: typeof opportunityData.title,
      titleLength: opportunityData.title?.length
    });
    const res = await request('/opportunities', { method: 'POST', body: JSON.stringify(opportunityData) })
    console.log('📡 API createOpportunity response:', res);
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
    hasCreateOpportunity: typeof window.api.createOpportunity === 'function',
    hasUpdateOpportunity: typeof window.api.updateOpportunity === 'function',
    hasListOpportunities: typeof window.api.listOpportunities === 'function',
    apiMethods: Object.keys(window.api)
  })
}

