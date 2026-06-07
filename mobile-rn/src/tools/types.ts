export type ReceiptAccount = {
  id: string
  name: string
  code: string
  qboAccountId?: string
  active?: boolean
  sortOrder?: number
}

export type ReceiptCostCenter = {
  id: string
  name: string
  code: string
  qboClassId?: string
  active?: boolean
  sortOrder?: number
}

export type ReceiptExtraction = {
  vendor?: string
  documentDate?: string
  total?: number
  currency?: string
  taxAmount?: number | null
  lineItems?: Array<{ description?: string; amount?: number }>
  rawText?: string
}

export type ReceiptDocument = {
  id: string
  userId: string
  fileUrl: string
  status: string
  extraction?: ReceiptExtraction
  vendor: string
  documentDate: string
  total: number
  currency: string
  taxAmount: number | null
  accountId: string | null
  costCenterId: string | null
  notes: string
  qboPurchaseId?: string | null
  qboSyncedAt?: string | null
  qboSyncError?: string
  createdAt: string
  updatedAt: string
  account?: ReceiptAccount | null
  costCenter?: ReceiptCostCenter | null
}

export type ReceiptDocumentPayload = {
  fileUrl: string
  extraction?: ReceiptExtraction
  vendor?: string
  documentDate?: string
  total?: number
  currency?: string
  taxAmount?: number | null
  accountId?: string | null
  costCenterId?: string | null
  notes?: string
  status?: string
}
