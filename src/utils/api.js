const API_BASE = 'https://abco-erp-2-production.up.railway.app/api'

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
  
  const res = await fetch(`${API_BASE}${path}`, { credentials: 'include', ...options, headers })
  const text = await res.text()
  const data = text ? JSON.parse(text) : {}
  
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
    const res = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
    if (res?.accessToken) window.storage.setToken(res.accessToken)
    return res
  },
  
  async me() {
    const res = await request('/me')
    return res?.data
  },
  
  async refresh() {
    const res = await request('/auth/refresh', { method: 'POST' })
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
}

// Expose globally for prototype
window.api = api

// Debug function to check if API is loaded
window.debugAPI = () => {
  console.log('🔍 API Debug:', {
    hasUpdateClient: typeof window.api.updateClient === 'function',
    hasCreateClient: typeof window.api.createClient === 'function',
    hasListClients: typeof window.api.listClients === 'function',
    apiMethods: Object.keys(window.api)
  })
}

