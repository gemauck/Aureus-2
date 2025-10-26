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
  
  const fullUrl = `${API_BASE}${path}`
  const requestOptions = { ...options, headers }
  
  console.log('🌐 API Request:', { 
    fullUrl,
    path, 
    method: options.method || 'GET', 
    headers,
    hasToken: !!token,
    tokenPreview: token ? token.substring(0, 20) + '...' : 'none',
    bodyPreview: options.body ? options.body.substring(0, 100) + '...' : 'none'
  });
  
  try {
    console.log('🌐 About to call fetch with:', { fullUrl, method: options.method, hasBody: !!options.body });
    const res = await fetch(fullUrl, requestOptions)
    console.log('🌐 Fetch completed, status:', res.status, 'ok:', res.ok);
    
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
  } catch (error) {
    console.error('❌ Fetch Error:', { path, error: error.message, stack: error.stack });
    throw error;
  }
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

  async getClients() {
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
    console.log('🔧 updateClient called with:', { id, clientData: JSON.stringify(clientData, null, 2) });
    console.log('🔍 Client data fields:', {
      hasContacts: !!clientData.contacts,
      hasFollowUps: !!clientData.followUps,
      hasSites: !!clientData.sites,
      hasComments: !!clientData.comments,
      contactsLength: Array.isArray(clientData.contacts) ? clientData.contacts.length : 'not array',
      contactsValue: clientData.contacts
    });
    const res = await request(`/clients/${id}`, { method: 'PATCH', body: JSON.stringify(clientData) })
    console.log('📥 updateClient response:', res);
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
    console.log('🚀 API createLead called with:', leadData);
    const res = await request('/leads', { method: 'POST', body: JSON.stringify(leadData) })
    console.log('📡 API createLead response:', res);
    return res
  },

  async updateLead(id, leadData) {
    console.log('🔧 updateLead called with:', { id, leadData: JSON.stringify(leadData, null, 2) });
    console.log('🔍 Lead data fields:', {
      hasContacts: !!leadData.contacts,
      hasFollowUps: !!leadData.followUps,
      hasProjectIds: !!leadData.projectIds,
      hasComments: !!leadData.comments,
      hasActivityLog: !!leadData.activityLog,
      hasSites: !!leadData.sites,
      hasContracts: !!leadData.contracts,
      hasBillingTerms: !!leadData.billingTerms,
      hasStage: !!leadData.stage,
      hasStatus: !!leadData.status,
      stage: leadData.stage,
      status: leadData.status,
      contactsLength: Array.isArray(leadData.contacts) ? leadData.contacts.length : 'not array',
      contactsValue: leadData.contacts
    });
    const res = await request(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify(leadData) })
    console.log('📥 updateLead response:', res);
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
    console.log('🚀 API createEmployee called with:', employeeData);
    const res = await request('/employees', { method: 'POST', body: JSON.stringify(employeeData) })
    console.log('📡 API createEmployee response:', res);
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

  // Contacts
  async getContacts(clientId) {
    const res = await request(`/contacts/client/${clientId}`)
    return res
  },
  async createContact(clientId, contactData) {
    console.log('🚀 API createContact called with:', { clientId, contactData });
    const res = await request(`/contacts/client/${clientId}`, { method: 'POST', body: JSON.stringify(contactData) })
    console.log('📡 API createContact response:', res);
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
    console.log('🚀 API createSite called with:', { clientId, siteData });
    const res = await request(`/sites/client/${clientId}`, { method: 'POST', body: JSON.stringify(siteData) })
    console.log('📡 API createSite response:', res);
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
