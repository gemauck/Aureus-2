import { apiUrl } from '../config'
import { fetchWithTokenRefresh, request } from '../services/apiClient'
import type {
  ReceiptAccount,
  ReceiptCostCenter,
  ReceiptDocument,
  ReceiptDocumentPayload,
  ReceiptExtraction
} from './types'

const EXTRACT_TIMEOUT_MS = 120_000

async function extractRequest<T>(
  token: string,
  path: string,
  body: unknown
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), EXTRACT_TIMEOUT_MS)
  try {
    const res = await fetchWithTokenRefresh(apiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: controller.signal
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(payload?.error?.message || payload?.message || 'Extraction failed')
    }
    return (payload?.data ?? payload) as T
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Extraction timed out — try again or enter fields manually.')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export const toolsApi = {
  uploadFile(token: string, name: string, dataUrl: string) {
    return request<{ url: string; name: string; mimeType?: string; size?: number }>('/api/files', {
      token,
      method: 'POST',
      body: { name, dataUrl, folder: 'receipt-capture' }
    })
  },

  extractReceipt(token: string, payload: { imageUrl?: string; imageBase64?: string; mimeType?: string }) {
    return extractRequest<{ extraction: ReceiptExtraction | null; noOpenAI?: boolean }>(
      token,
      '/api/receipt-extract',
      payload
    )
  },

  getAccounts(token: string) {
    return request<{ accounts: ReceiptAccount[] }>('/api/receipt-accounts', { token }).then(
      (d) => d.accounts || []
    )
  },

  createAccount(token: string, payload: { name: string; code?: string }) {
    return request<{ account: ReceiptAccount }>('/api/receipt-accounts', {
      token,
      method: 'POST',
      body: payload
    })
  },

  deleteAccount(token: string, id: string) {
    return request(`/api/receipt-accounts/${encodeURIComponent(id)}`, { token, method: 'DELETE' })
  },

  getCostCenters(token: string) {
    return request<{ costCenters: ReceiptCostCenter[] }>('/api/receipt-cost-centers', { token }).then(
      (d) => d.costCenters || []
    )
  },

  createCostCenter(token: string, payload: { name: string; code?: string }) {
    return request<{ costCenter: ReceiptCostCenter }>('/api/receipt-cost-centers', {
      token,
      method: 'POST',
      body: payload
    })
  },

  deleteCostCenter(token: string, id: string) {
    return request(`/api/receipt-cost-centers/${encodeURIComponent(id)}`, { token, method: 'DELETE' })
  },

  getDocuments(token: string, options: { all?: boolean } = {}) {
    const q = options.all ? '?all=1' : ''
    return request<{ documents: ReceiptDocument[] }>(`/api/receipt-documents${q}`, { token }).then(
      (d) => d.documents || []
    )
  },

  createDocument(token: string, payload: ReceiptDocumentPayload) {
    return request<{ document: ReceiptDocument }>('/api/receipt-documents', {
      token,
      method: 'POST',
      body: payload
    })
  },

  updateDocument(token: string, id: string, payload: ReceiptDocumentPayload) {
    return request<{ document: ReceiptDocument }>(`/api/receipt-documents/${encodeURIComponent(id)}`, {
      token,
      method: 'PATCH',
      body: payload
    })
  },

  deleteDocument(token: string, id: string) {
    return request(`/api/receipt-documents/${encodeURIComponent(id)}`, { token, method: 'DELETE' })
  },

  getQuickBooksConnection(token: string) {
    return request<{
      configured: boolean
      connected: boolean
      companyName?: string | null
      defaultPaymentAccountId?: string | null
      environment?: string
    }>('/api/quickbooks/connection', { token })
  },

  getQuickBooksAuthUrl(token: string) {
    return request<{ authUrl: string }>('/api/quickbooks/auth-url', { token })
  },

  updateQuickBooksConnection(token: string, payload: { defaultPaymentAccountId: string }) {
    return request('/api/quickbooks/connection', { token, method: 'PATCH', body: payload })
  },

  disconnectQuickBooks(token: string) {
    return request('/api/quickbooks/connection', { token, method: 'DELETE' })
  },

  getQuickBooksExpenseAccounts(token: string) {
    return request<{ accounts: Array<{ id: string; name: string; accountType?: string; acctNum?: string }> }>(
      '/api/quickbooks/accounts',
      { token }
    ).then((d) => d.accounts || [])
  },

  getQuickBooksPaymentAccounts(token: string) {
    return request<{ accounts: Array<{ id: string; name: string; accountType?: string }> }>(
      '/api/quickbooks/payment-accounts',
      { token }
    ).then((d) => d.accounts || [])
  },

  getQuickBooksClasses(token: string) {
    return request<{ classes: Array<{ id: string; name: string }> }>('/api/quickbooks/classes', { token }).then(
      (d) => d.classes || []
    )
  },

  updateAccount(token: string, id: string, payload: { qboAccountId?: string }) {
    return request(`/api/receipt-accounts/${encodeURIComponent(id)}`, {
      token,
      method: 'PATCH',
      body: payload
    })
  },

  updateCostCenter(token: string, id: string, payload: { qboClassId?: string }) {
    return request(`/api/receipt-cost-centers/${encodeURIComponent(id)}`, {
      token,
      method: 'PATCH',
      body: payload
    })
  },

  pushToQuickBooks(token: string, payload: { documentIds?: string[]; allReviewed?: boolean; force?: boolean }) {
    return request<{ pushed: number; failed: number; skipped: number; results: unknown[] }>(
      '/api/receipt-documents/push-qbo',
      { token, method: 'POST', body: payload }
    )
  }
}
