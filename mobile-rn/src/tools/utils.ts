import * as FileSystem from 'expo-file-system'
import * as ImageManipulator from 'expo-image-manipulator'
import { Alert, Linking, Share } from 'react-native'
import { API_BASE_URL } from '../config'
import type { ReceiptAccount, ReceiptCostCenter, ReceiptDocument } from './types'

const MAX_IMAGE_DIMENSION = 2000
const MAX_FILE_BYTES = 20 * 1024 * 1024

export function escapeCsvCell(val: unknown): string {
  const s = val == null ? '' : String(val)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function fullFileUrl(fileUrl: string): string {
  const path = fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`
  return `${API_BASE_URL}${path}`
}

export function isPdfUrl(url: string): boolean {
  return /\.pdf($|\?)/i.test(url) || url.toLowerCase().includes('application/pdf')
}

export async function compressImageUri(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_IMAGE_DIMENSION } }],
    { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  )
  return `data:image/jpeg;base64,${result.base64 || ''}`
}

export async function fileUriToDataUrl(uri: string, mimeType: string, name: string): Promise<string> {
  const trimmed = String(uri || '').trim()
  if (!trimmed) throw new Error('Empty file')
  if (trimmed.startsWith('data:')) return trimmed

  const base64 = await FileSystem.readAsStringAsync(trimmed, {
    encoding: FileSystem.EncodingType.Base64
  })
  const bytes = Math.ceil((base64.length * 3) / 4)
  if (bytes > MAX_FILE_BYTES) {
    throw new Error('File must be 20MB or smaller.')
  }

  const ext = (name.split('.').pop() || '').toLowerCase()
  const mime =
    mimeType ||
    (ext === 'pdf'
      ? 'application/pdf'
      : ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : 'image/jpeg')

  return `data:${mime};base64,${base64}`
}

export async function exportReceiptCsv(
  documents: ReceiptDocument[],
  accounts: ReceiptAccount[],
  costCenters: ReceiptCostCenter[]
): Promise<void> {
  const rows = documents.filter(
    (d) => d.status === 'reviewed' || d.status === 'exported' || d.status === 'draft'
  )
  if (!rows.length) {
    Alert.alert('Export', 'No rows to export. Save expenses or include draft rows.')
    return
  }

  const header = [
    'Date',
    'Vendor',
    'Total',
    'Currency',
    'Tax',
    'Account',
    'AccountCode',
    'CostCentre',
    'CostCentreCode',
    'Status',
    'Notes',
    'SourceURL'
  ]
  const lines = [header.join(',')]
  for (const d of rows) {
    const acc = d.account || accounts.find((a) => a.id === d.accountId)
    const cc = d.costCenter || costCenters.find((c) => c.id === d.costCenterId)
    lines.push(
      [
        escapeCsvCell(d.documentDate),
        escapeCsvCell(d.vendor),
        escapeCsvCell(d.total),
        escapeCsvCell(d.currency),
        escapeCsvCell(d.taxAmount),
        escapeCsvCell(acc?.name),
        escapeCsvCell(acc?.code),
        escapeCsvCell(cc?.name),
        escapeCsvCell(cc?.code),
        escapeCsvCell(d.status),
        escapeCsvCell(d.notes),
        escapeCsvCell(d.fileUrl ? fullFileUrl(d.fileUrl) : '')
      ].join(',')
    )
  }

  const csv = lines.join('\n')
  const filename = `expense-export-${new Date().toISOString().slice(0, 10)}.csv`
  const fileUri = `${FileSystem.cacheDirectory}${filename}`
  await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 })

  try {
    await Share.share({ url: fileUri, title: filename, message: csv })
  } catch {
    Alert.alert('Export saved', `CSV written to cache:\n${fileUri}`)
  }
}

export async function openReceiptFile(fileUrl: string): Promise<void> {
  const url = fullFileUrl(fileUrl)
  const supported = await Linking.canOpenURL(url)
  if (!supported) {
    Alert.alert('Open file', `Cannot open:\n${url}`)
    return
  }
  await Linking.openURL(url)
}

export async function downloadReceiptFile(fileUrl: string, name?: string): Promise<void> {
  const url = fullFileUrl(fileUrl)
  const ext = isPdfUrl(fileUrl) ? 'pdf' : 'jpg'
  const filename = name || `receipt-${Date.now()}.${ext}`
  const dest = `${FileSystem.documentDirectory}${filename}`
  const result = await FileSystem.downloadAsync(url, dest)
  if (result.status !== 200) {
    throw new Error(`Download failed (${result.status})`)
  }
  try {
    await Share.share({ url: result.uri, title: filename })
  } catch {
    Alert.alert('Downloaded', `Saved to:\n${result.uri}`)
  }
}
