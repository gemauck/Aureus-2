import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { FontAwesome5 } from '@expo/vector-icons'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { ModuleHeader } from '../../components/shell/ModuleHeader'
import { ScreenBody } from '../../components/shell/ScreenBody'
import { useAuth } from '../../state/AuthContext'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'
import { isAdmin } from '../../utils/menuAccess'
import { toolsApi } from '../api'
import type { ToolsStackParamList } from '../navigation'
import type { ReceiptAccount, ReceiptCostCenter, ReceiptDocument, ReceiptExtraction } from '../types'
import {
  compressImageUri,
  downloadReceiptFile,
  exportReceiptCsv,
  fileUriToDataUrl,
  fullFileUrl,
  isPdfUrl,
  openReceiptFile
} from '../utils'

type Props = NativeStackScreenProps<ToolsStackParamList, 'ExpenseCapture'>
type TabId = 'inbox' | 'capture' | 'settings'

const STATUS_OPTIONS = ['draft', 'reviewed', 'exported'] as const

export function ExpenseCaptureScreen({ navigation }: Props) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { accessToken, user } = useAuth()
  const isAdminUser = useMemo(() => isAdmin(user), [user])

  const [tab, setTab] = useState<TabId>('inbox')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [msg, setMsg] = useState('')

  const [documents, setDocuments] = useState<ReceiptDocument[]>([])
  const [accounts, setAccounts] = useState<ReceiptAccount[]>([])
  const [costCenters, setCostCenters] = useState<ReceiptCostCenter[]>([])

  const [capturePreview, setCapturePreview] = useState('')
  const [captureName, setCaptureName] = useState('')
  const [uploadedUrl, setUploadedUrl] = useState('')
  const [extraction, setExtraction] = useState<ReceiptExtraction | null>(null)
  const [noOpenAI, setNoOpenAI] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [saving, setSaving] = useState(false)

  const [vendor, setVendor] = useState('')
  const [documentDate, setDocumentDate] = useState('')
  const [total, setTotal] = useState('')
  const [currency, setCurrency] = useState('ZAR')
  const [taxAmount, setTaxAmount] = useState('')
  const [accountId, setAccountId] = useState('')
  const [costCenterId, setCostCenterId] = useState('')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState('draft')
  const [editingId, setEditingId] = useState<string | null>(null)

  const [newAccName, setNewAccName] = useState('')
  const [newAccCode, setNewAccCode] = useState('')
  const [newCcName, setNewCcName] = useState('')
  const [newCcCode, setNewCcCode] = useState('')

  const [qboConnection, setQboConnection] = useState<{
    configured?: boolean
    connected?: boolean
    companyName?: string | null
    defaultPaymentAccountId?: string | null
  }>({})
  const [qboExpenseAccounts, setQboExpenseAccounts] = useState<Array<{ id: string; name: string; acctNum?: string }>>([])
  const [qboPaymentAccounts, setQboPaymentAccounts] = useState<Array<{ id: string; name: string; accountType?: string }>>([])
  const [qboClasses, setQboClasses] = useState<Array<{ id: string; name: string }>>([])
  const [qboPaymentAccountId, setQboPaymentAccountId] = useState('')
  const [qboPushing, setQboPushing] = useState(false)

  const resetCaptureForm = useCallback(() => {
    setCapturePreview('')
    setCaptureName('')
    setUploadedUrl('')
    setExtraction(null)
    setNoOpenAI(false)
    setVendor('')
    setDocumentDate('')
    setTotal('')
    setCurrency('ZAR')
    setTaxAmount('')
    setAccountId('')
    setCostCenterId('')
    setNotes('')
    setStatus('draft')
    setEditingId(null)
  }, [])

  const loadLookups = useCallback(async () => {
    if (!accessToken) return
    const [a, c] = await Promise.all([
      toolsApi.getAccounts(accessToken),
      toolsApi.getCostCenters(accessToken)
    ])
    setAccounts(a)
    setCostCenters(c)
  }, [accessToken])

  const loadDocuments = useCallback(async () => {
    if (!accessToken) return
    const list = await toolsApi.getDocuments(accessToken, { all: isAdminUser })
    setDocuments(list)
  }, [accessToken, isAdminUser])

  const loadQboConnection = useCallback(async () => {
    if (!accessToken || !isAdminUser) return
    try {
      const data = await toolsApi.getQuickBooksConnection(accessToken)
      setQboConnection(data)
      if (data.defaultPaymentAccountId) setQboPaymentAccountId(data.defaultPaymentAccountId)
    } catch {
      setQboConnection({ connected: false, configured: false })
    }
  }, [accessToken, isAdminUser])

  const loadQboLookups = useCallback(async () => {
    if (!accessToken || !isAdminUser || !qboConnection.connected) return
    try {
      const [exp, pay, cls] = await Promise.all([
        toolsApi.getQuickBooksExpenseAccounts(accessToken),
        toolsApi.getQuickBooksPaymentAccounts(accessToken),
        toolsApi.getQuickBooksClasses(accessToken)
      ])
      setQboExpenseAccounts(exp)
      setQboPaymentAccounts(pay)
      setQboClasses(cls)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not load QuickBooks lists')
    }
  }, [accessToken, isAdminUser, qboConnection.connected])

  const loadAll = useCallback(
    async (silent = false) => {
      if (!accessToken) return
      if (!silent) setLoading(true)
      setMsg('')
      try {
        await Promise.all([loadLookups(), loadDocuments(), loadQboConnection()])
      } catch (e) {
        setMsg(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [accessToken, loadDocuments, loadLookups, loadQboConnection]
  )

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  useEffect(() => {
    void loadQboLookups()
  }, [loadQboLookups])

  useFocusEffect(
    useCallback(() => {
      void loadQboConnection()
    }, [loadQboConnection])
  )

  const applyExtraction = (ext: ReceiptExtraction | null) => {
    if (!ext) return
    setVendor(ext.vendor || '')
    setDocumentDate((ext.documentDate || '').slice(0, 10))
    setTotal(ext.total != null ? String(ext.total) : '')
    setCurrency(ext.currency || 'ZAR')
    setTaxAmount(ext.taxAmount != null ? String(ext.taxAmount) : '')
  }

  const setPickedFile = (dataUrl: string, name: string) => {
    setCapturePreview(dataUrl)
    setCaptureName(name)
    setUploadedUrl('')
    setExtraction(null)
    setNoOpenAI(false)
  }

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Camera', 'Allow camera access to photograph receipts.')
      return
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: false
    })
    if (res.canceled || !res.assets[0]?.uri) return
    setProcessing(true)
    try {
      const dataUrl = await compressImageUri(res.assets[0].uri)
      setPickedFile(dataUrl, res.assets[0].fileName || `receipt-${Date.now()}.jpg`)
    } catch (e) {
      Alert.alert('Camera', e instanceof Error ? e.message : 'Could not process photo')
    } finally {
      setProcessing(false)
    }
  }

  const pickGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Photos', 'Allow photo library access.')
      return
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsMultipleSelection: false
    })
    if (res.canceled || !res.assets[0]?.uri) return
    setProcessing(true)
    try {
      const dataUrl = await compressImageUri(res.assets[0].uri)
      setPickedFile(dataUrl, res.assets[0].fileName || `receipt-${Date.now()}.jpg`)
    } catch (e) {
      Alert.alert('Photos', e instanceof Error ? e.message : 'Could not process image')
    } finally {
      setProcessing(false)
    }
  }

  const pickDocument = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true
    })
    if (picked.canceled || !picked.assets?.[0]) return
    const asset = picked.assets[0]
    setProcessing(true)
    try {
      const dataUrl = await fileUriToDataUrl(
        asset.uri,
        asset.mimeType || 'application/octet-stream',
        asset.name || 'document'
      )
      setPickedFile(dataUrl, asset.name || 'document')
    } catch (e) {
      Alert.alert('Document', e instanceof Error ? e.message : 'Could not read file')
    } finally {
      setProcessing(false)
    }
  }

  const runExtractAndPrepare = async () => {
    if (!accessToken) return
    if (!capturePreview && !uploadedUrl) {
      Alert.alert('Capture', 'Take a photo or choose a file first.')
      return
    }
    setProcessing(true)
    setMsg('')
    try {
      let url = uploadedUrl
      if (capturePreview.startsWith('data:')) {
        const upload = await toolsApi.uploadFile(
          accessToken,
          captureName || `expense-${Date.now()}.jpg`,
          capturePreview
        )
        url = upload.url
        setUploadedUrl(url)
      } else if (!url) {
        Alert.alert('Capture', 'Upload a new file before extracting.')
        return
      }

      try {
        const res = await toolsApi.extractReceipt(accessToken, { imageUrl: url })
        setNoOpenAI(res.noOpenAI === true)
        setExtraction(res.extraction)
        applyExtraction(res.extraction)
      } catch (err) {
        setMsg(err instanceof Error ? err.message : 'Extraction failed; enter fields manually.')
      }
    } catch (e) {
      Alert.alert('Upload', e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setProcessing(false)
    }
  }

  const saveDocument = async () => {
    if (!accessToken || !uploadedUrl) {
      Alert.alert('Save', 'Upload and extract first.')
      return
    }
    setSaving(true)
    setMsg('')
    try {
      const payload = {
        fileUrl: uploadedUrl,
        extraction: extraction || {},
        vendor,
        documentDate,
        total: parseFloat(total) || 0,
        currency,
        taxAmount: taxAmount === '' ? null : parseFloat(taxAmount),
        accountId: accountId || null,
        costCenterId: costCenterId || null,
        notes,
        status
      }
      if (editingId) {
        await toolsApi.updateDocument(accessToken, editingId, payload)
        setMsg('Saved.')
      } else {
        await toolsApi.createDocument(accessToken, payload)
        setMsg('Expense saved.')
      }
      await loadDocuments()
      resetCaptureForm()
      setTab('inbox')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const openEdit = (doc: ReceiptDocument) => {
    setEditingId(doc.id)
    setUploadedUrl(doc.fileUrl)
    setExtraction(doc.extraction || null)
    setVendor(doc.vendor || '')
    setDocumentDate((doc.documentDate || '').slice(0, 10))
    setTotal(doc.total != null ? String(doc.total) : '')
    setCurrency(doc.currency || 'ZAR')
    setTaxAmount(doc.taxAmount != null ? String(doc.taxAmount) : '')
    setAccountId(doc.accountId || '')
    setCostCenterId(doc.costCenterId || '')
    setNotes(doc.notes || '')
    setStatus(doc.status || 'draft')
    const fu = doc.fileUrl || ''
    if (fu && !isPdfUrl(fu)) {
      setCapturePreview(fullFileUrl(fu))
    } else {
      setCapturePreview('')
    }
    setCaptureName(fu.split('/').pop() || 'receipt')
    setTab('capture')
  }

  const deleteDoc = (id: string) => {
    Alert.alert('Delete expense', 'Remove this expense permanently?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            if (!accessToken) return
            try {
              await toolsApi.deleteDocument(accessToken, id)
              await loadDocuments()
            } catch (e) {
              Alert.alert('Delete', e instanceof Error ? e.message : 'Delete failed')
            }
          })()
        }
      }
    ])
  }

  const addAccount = async () => {
    if (!accessToken) return
    const name = newAccName.trim()
    if (!name) return
    try {
      await toolsApi.createAccount(accessToken, { name, code: newAccCode.trim() })
      setNewAccName('')
      setNewAccCode('')
      await loadLookups()
    } catch (e) {
      Alert.alert('Account', e instanceof Error ? e.message : 'Failed')
    }
  }

  const removeAccount = (id: string) => {
    Alert.alert('Remove account', 'Remove this account?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            if (!accessToken) return
            try {
              await toolsApi.deleteAccount(accessToken, id)
              await loadLookups()
            } catch (e) {
              Alert.alert('Account', e instanceof Error ? e.message : 'Failed')
            }
          })()
        }
      }
    ])
  }

  const addCostCenter = async () => {
    if (!accessToken) return
    const name = newCcName.trim()
    if (!name) return
    try {
      await toolsApi.createCostCenter(accessToken, { name, code: newCcCode.trim() })
      setNewCcName('')
      setNewCcCode('')
      await loadLookups()
    } catch (e) {
      Alert.alert('Cost centre', e instanceof Error ? e.message : 'Failed')
    }
  }

  const removeCostCenter = (id: string) => {
    Alert.alert('Remove cost centre', 'Remove this cost centre?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            if (!accessToken) return
            try {
              await toolsApi.deleteCostCenter(accessToken, id)
              await loadLookups()
            } catch (e) {
              Alert.alert('Cost centre', e instanceof Error ? e.message : 'Failed')
            }
          })()
        }
      }
    ])
  }

  const connectQuickBooks = async () => {
    if (!accessToken) return
    try {
      const { authUrl } = await toolsApi.getQuickBooksAuthUrl(accessToken)
      await Linking.openURL(authUrl)
      Alert.alert(
        'QuickBooks',
        'Complete sign-in in the browser, then return here and pull to refresh Setup.'
      )
    } catch (e) {
      Alert.alert('QuickBooks', e instanceof Error ? e.message : 'Could not start connection')
    }
  }

  const pushToQuickBooks = async () => {
    if (!accessToken) return
    const eligible = documents.filter((d) => (d.status === 'reviewed' || d.status === 'draft') && d.accountId)
    if (!eligible.length) {
      Alert.alert('QuickBooks', 'No allocated expenses to push.')
      return
    }
    if (!qboConnection.connected) {
      Alert.alert('QuickBooks', 'Connect QuickBooks in Setup first.')
      return
    }
    setQboPushing(true)
    try {
      const result = await toolsApi.pushToQuickBooks(accessToken, {
        documentIds: eligible.map((d) => d.id)
      })
      setMsg(`QBO: ${result.pushed} pushed, ${result.failed} failed, ${result.skipped} skipped.`)
      await loadDocuments()
    } catch (e) {
      Alert.alert('QuickBooks', e instanceof Error ? e.message : 'Push failed')
    } finally {
      setQboPushing(false)
    }
  }

  const handleExportCsv = async () => {
    try {
      await exportReceiptCsv(documents, accounts, costCenters)
    } catch (e) {
      Alert.alert('Export', e instanceof Error ? e.message : 'Export failed')
    }
  }

  const switchTab = (id: TabId) => {
    setTab(id)
    if (id === 'capture' && !editingId) resetCaptureForm()
  }

  const renderPicker = () => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Photo or file</Text>
      <Pressable style={[styles.captureBtn, styles.cameraBtn]} onPress={() => void takePhoto()} disabled={processing}>
        <FontAwesome5 name="camera" size={18} color="#fff" />
        <Text style={styles.captureBtnText}>Take photo</Text>
      </Pressable>
      <Pressable style={[styles.captureBtn, styles.galleryBtn]} onPress={() => void pickGallery()} disabled={processing}>
        <FontAwesome5 name="images" size={16} color={erp.text} />
        <Text style={[styles.captureBtnText, styles.galleryBtnText]}>Gallery</Text>
      </Pressable>
      <Pressable style={[styles.captureBtn, styles.galleryBtn]} onPress={() => void pickDocument()} disabled={processing}>
        <FontAwesome5 name="file-pdf" size={16} color={erp.text} />
        <Text style={[styles.captureBtnText, styles.galleryBtnText]}>PDF or document</Text>
      </Pressable>
      {capturePreview && !capturePreview.startsWith('data:application/pdf') ? (
        <Image source={{ uri: capturePreview }} style={styles.preview} resizeMode="contain" />
      ) : null}
      {capturePreview && capturePreview.startsWith('data:application/pdf') ? (
        <Text style={styles.hint}>PDF selected — preview not shown.</Text>
      ) : null}
      {uploadedUrl && !capturePreview.startsWith('data:') ? (
        <Text style={styles.hint}>Existing file on server: {uploadedUrl.split('/').pop()}</Text>
      ) : null}
      <Pressable
        style={[styles.primaryBtn, (processing || (!capturePreview && !uploadedUrl)) && styles.btnDisabled]}
        onPress={() => void runExtractAndPrepare()}
        disabled={processing || (!capturePreview && !uploadedUrl)}
      >
        {processing ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryBtnText}>Upload & extract</Text>
        )}
      </Pressable>
      {noOpenAI ? (
        <Text style={styles.warn}>Automatic extraction is not configured. Enter fields manually.</Text>
      ) : null}
      {editingId ? <Text style={styles.hint}>Editing expense #{editingId.slice(0, 8)}…</Text> : null}
    </View>
  )

  const renderForm = () => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Details & allocation</Text>
      <Field label="Vendor" value={vendor} onChangeText={setVendor} erp={erp} />
      <Field label="Date (YYYY-MM-DD)" value={documentDate} onChangeText={setDocumentDate} erp={erp} />
      <Field label="Total" value={total} onChangeText={setTotal} erp={erp} keyboardType="decimal-pad" />
      <Field label="Currency" value={currency} onChangeText={setCurrency} erp={erp} />
      <Field label="Tax (optional)" value={taxAmount} onChangeText={setTaxAmount} erp={erp} keyboardType="decimal-pad" />
      <Text style={styles.fieldLabel}>Status</Text>
      <View style={styles.chipRow}>
        {STATUS_OPTIONS.map((s) => (
          <Pressable
            key={s}
            style={[styles.chip, status === s && styles.chipActive]}
            onPress={() => setStatus(s)}
          >
            <Text style={[styles.chipText, status === s && styles.chipTextActive]}>{s}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.fieldLabel}>Account</Text>
      <View style={styles.chipRow}>
        <Pressable style={[styles.chip, !accountId && styles.chipActive]} onPress={() => setAccountId('')}>
          <Text style={[styles.chipText, !accountId && styles.chipTextActive]}>—</Text>
        </Pressable>
        {accounts.map((a) => (
          <Pressable
            key={a.id}
            style={[styles.chip, accountId === a.id && styles.chipActive]}
            onPress={() => setAccountId(a.id)}
          >
            <Text style={[styles.chipText, accountId === a.id && styles.chipTextActive]}>
              {a.code ? `${a.code} · ` : ''}
              {a.name}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.fieldLabel}>Cost centre</Text>
      <View style={styles.chipRow}>
        <Pressable style={[styles.chip, !costCenterId && styles.chipActive]} onPress={() => setCostCenterId('')}>
          <Text style={[styles.chipText, !costCenterId && styles.chipTextActive]}>—</Text>
        </Pressable>
        {costCenters.map((c) => (
          <Pressable
            key={c.id}
            style={[styles.chip, costCenterId === c.id && styles.chipActive]}
            onPress={() => setCostCenterId(c.id)}
          >
            <Text style={[styles.chipText, costCenterId === c.id && styles.chipTextActive]}>
              {c.code ? `${c.code} · ` : ''}
              {c.name}
            </Text>
          </Pressable>
        ))}
      </View>
      <Field label="Notes" value={notes} onChangeText={setNotes} erp={erp} multiline />
      <Pressable
        style={[styles.saveBtn, (saving || !uploadedUrl) && styles.btnDisabled]}
        onPress={() => void saveDocument()}
        disabled={saving || !uploadedUrl}
      >
        <Text style={styles.primaryBtnText}>{saving ? 'Saving…' : editingId ? 'Update expense' : 'Submit expense'}</Text>
      </Pressable>
      <Pressable
        style={styles.secondaryBtn}
        onPress={() => {
          resetCaptureForm()
          setTab('inbox')
        }}
      >
        <Text style={styles.secondaryBtnText}>Cancel</Text>
      </Pressable>
    </View>
  )

  const renderInbox = () => (
    <View style={styles.inbox}>
      {documents.length === 0 ? (
        <Text style={styles.empty}>No expenses yet. Tap Capture to add one.</Text>
      ) : (
        documents.map((d) => (
          <View key={d.id} style={styles.docCard}>
            <View style={styles.docHeader}>
              <View style={styles.docThumb}>
                {d.fileUrl && !isPdfUrl(d.fileUrl) ? (
                  <Image source={{ uri: fullFileUrl(d.fileUrl) }} style={styles.thumbImg} />
                ) : (
                  <FontAwesome5 name="file-pdf" size={28} color={erp.textSubtle} />
                )}
              </View>
              <View style={styles.docMeta}>
                <Text style={styles.docVendor}>{d.vendor || 'Expense'}</Text>
                <Text style={styles.docDate}>{d.documentDate || '—'}</Text>
                <Text style={styles.docAlloc}>
                  {[d.account?.name, d.costCenter?.name].filter(Boolean).join(' · ') || 'Unallocated'}
                </Text>
              </View>
              <View style={styles.docAmount}>
                <Text style={styles.docTotal}>
                  {d.currency} {Number(d.total || 0).toFixed(2)}
                </Text>
                <Text style={styles.docStatus}>
                  {d.status}
                  {d.qboPurchaseId ? ' · QBO' : ''}
                </Text>
              </View>
            </View>
            <View style={styles.docActions}>
              <Pressable style={styles.docActionBtn} onPress={() => openEdit(d)}>
                <Text style={styles.docActionText}>Edit</Text>
              </Pressable>
              {d.fileUrl ? (
                <>
                  <Pressable style={styles.docActionBtn} onPress={() => void openReceiptFile(d.fileUrl)}>
                    <Text style={styles.docActionText}>View</Text>
                  </Pressable>
                  <Pressable
                    style={styles.docActionBtn}
                    onPress={() => {
                      void downloadReceiptFile(d.fileUrl, d.vendor || undefined).catch((e) =>
                        Alert.alert('Download', e instanceof Error ? e.message : 'Download failed')
                      )
                    }}
                  >
                    <Text style={styles.docActionText}>Download</Text>
                  </Pressable>
                </>
              ) : null}
              <Pressable style={[styles.docActionBtn, styles.docDeleteBtn]} onPress={() => deleteDoc(d.id)}>
                <Text style={styles.docDeleteText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}
    </View>
  )

  const renderSettings = () =>
    isAdminUser ? (
      <View style={styles.settings}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>QuickBooks Online</Text>
          {!qboConnection.configured ? (
            <Text style={styles.warn}>Server OAuth not configured — CSV export still available.</Text>
          ) : null}
          {qboConnection.connected ? (
            <>
              <Text style={styles.qboOk}>
                Connected{qboConnection.companyName ? `: ${qboConnection.companyName}` : ''}
              </Text>
              <Text style={styles.fieldLabel}>Payment account</Text>
              <View style={styles.chipRow}>
                {qboPaymentAccounts.map((a) => (
                  <Pressable
                    key={a.id}
                    style={[
                      styles.chip,
                      (qboPaymentAccountId || qboConnection.defaultPaymentAccountId) === a.id && styles.chipActive
                    ]}
                    onPress={() => {
                      void (async () => {
                        if (!accessToken) return
                        setQboPaymentAccountId(a.id)
                        await toolsApi.updateQuickBooksConnection(accessToken, { defaultPaymentAccountId: a.id })
                        await loadQboConnection()
                      })()
                    }}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        (qboPaymentAccountId || qboConnection.defaultPaymentAccountId) === a.id && styles.chipTextActive
                      ]}
                    >
                      {a.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                style={[styles.primaryBtn, qboPushing && styles.btnDisabled]}
                onPress={() => void pushToQuickBooks()}
                disabled={qboPushing}
              >
                <Text style={styles.primaryBtnText}>{qboPushing ? 'Pushing…' : 'Push to QuickBooks'}</Text>
              </Pressable>
              <Pressable
                style={styles.secondaryBtn}
                onPress={() => {
                  Alert.alert('Disconnect QuickBooks?', '', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Disconnect',
                      style: 'destructive',
                      onPress: () => {
                        void (async () => {
                          if (!accessToken) return
                          await toolsApi.disconnectQuickBooks(accessToken)
                          await loadQboConnection()
                        })()
                      }
                    }
                  ])
                }}
              >
                <Text style={styles.secondaryBtnText}>Disconnect</Text>
              </Pressable>
            </>
          ) : (
            <Pressable style={styles.saveBtn} onPress={() => void connectQuickBooks()}>
              <Text style={styles.primaryBtnText}>Connect QuickBooks (browser)</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Accounts (chart of accounts)</Text>
          <Text style={styles.hint}>Map each ERP account to a QBO expense account when connected.</Text>
          <View style={styles.adminRow}>
            <TextInput
              style={styles.adminInput}
              placeholder="Name"
              placeholderTextColor={erp.textSubtle}
              value={newAccName}
              onChangeText={setNewAccName}
            />
            <TextInput
              style={[styles.adminInput, styles.adminInputCode]}
              placeholder="Code"
              placeholderTextColor={erp.textSubtle}
              value={newAccCode}
              onChangeText={setNewAccCode}
            />
            <Pressable style={styles.adminAddBtn} onPress={() => void addAccount()}>
              <Text style={styles.adminAddText}>Add</Text>
            </Pressable>
          </View>
          {accounts.map((a) => (
            <View key={a.id} style={styles.adminListBlock}>
              <View style={styles.adminListItem}>
                <Text style={styles.adminListText}>
                  {a.code ? `${a.code} — ` : ''}
                  {a.name}
                </Text>
                <Pressable onPress={() => removeAccount(a.id)}>
                  <Text style={styles.docDeleteText}>Remove</Text>
                </Pressable>
              </View>
              {qboConnection.connected ? (
                <View style={styles.chipRow}>
                  {qboExpenseAccounts.map((q) => (
                    <Pressable
                      key={q.id}
                      style={[styles.chip, a.qboAccountId === q.id && styles.chipActive]}
                      onPress={() => {
                        void (async () => {
                          if (!accessToken) return
                          await toolsApi.updateAccount(accessToken, a.id, { qboAccountId: q.id })
                          await loadLookups()
                        })()
                      }}
                    >
                      <Text style={[styles.chipText, a.qboAccountId === q.id && styles.chipTextActive]}>{q.name}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          ))}
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Cost centres</Text>
          <View style={styles.adminRow}>
            <TextInput
              style={styles.adminInput}
              placeholder="Name"
              placeholderTextColor={erp.textSubtle}
              value={newCcName}
              onChangeText={setNewCcName}
            />
            <TextInput
              style={[styles.adminInput, styles.adminInputCode]}
              placeholder="Code"
              placeholderTextColor={erp.textSubtle}
              value={newCcCode}
              onChangeText={setNewCcCode}
            />
            <Pressable style={styles.adminAddBtn} onPress={() => void addCostCenter()}>
              <Text style={styles.adminAddText}>Add</Text>
            </Pressable>
          </View>
          {costCenters.map((c) => (
            <View key={c.id} style={styles.adminListBlock}>
              <View style={styles.adminListItem}>
                <Text style={styles.adminListText}>
                  {c.code ? `${c.code} — ` : ''}
                  {c.name}
                </Text>
                <Pressable onPress={() => removeCostCenter(c.id)}>
                  <Text style={styles.docDeleteText}>Remove</Text>
                </Pressable>
              </View>
              {qboConnection.connected ? (
                <View style={styles.chipRow}>
                  {qboClasses.map((q) => (
                    <Pressable
                      key={q.id}
                      style={[styles.chip, c.qboClassId === q.id && styles.chipActive]}
                      onPress={() => {
                        void (async () => {
                          if (!accessToken) return
                          await toolsApi.updateCostCenter(accessToken, c.id, { qboClassId: q.id })
                          await loadLookups()
                        })()
                      }}
                    >
                      <Text style={[styles.chipText, c.qboClassId === q.id && styles.chipTextActive]}>{q.name}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          ))}
        </View>
        <Text style={styles.hint}>Push creates QBO Purchase expenses with receipt attachments when possible.</Text>
      </View>
    ) : (
      <Text style={styles.empty}>Admin access required to manage accounts and cost centres.</Text>
    )

  if (loading) {
    return (
      <View style={styles.root}>
        <ModuleHeader title="Expense Capture" showBack onBack={() => navigation.goBack()} />
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={erp.primary} />
        </View>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <ModuleHeader
        title="Expense Capture"
        subtitle="Snap · allocate · export"
        showBack
        onBack={() => navigation.goBack()}
      />
      <ScreenBody padded={false}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadAll(true) }} />}
        >
          <Pressable style={styles.exportBar} onPress={() => void handleExportCsv()}>
            <FontAwesome5 name="file-csv" size={14} color={erp.primary} />
            <Text style={styles.exportBarText}>Export CSV for QuickBooks / spreadsheet</Text>
          </Pressable>
          <Text style={styles.policy}>
            Only upload what you need for expenses; follow your company retention policy. All files are stored on the
            ERP server.
          </Text>
          {msg ? <Text style={styles.msg}>{msg}</Text> : null}
          {tab === 'inbox' && renderInbox()}
          {tab === 'capture' && (
            <View style={styles.captureStack}>
              {renderPicker()}
              {renderForm()}
            </View>
          )}
          {tab === 'settings' && renderSettings()}
        </ScrollView>
      </ScreenBody>
      <View style={styles.bottomNav}>
        <NavBtn id="inbox" icon="inbox" label="Inbox" active={tab === 'inbox'} onPress={switchTab} styles={styles} erp={erp} />
        <NavBtn id="capture" icon="camera" label="Capture" active={tab === 'capture'} onPress={switchTab} styles={styles} erp={erp} />
        {isAdminUser ? (
          <NavBtn id="settings" icon="cog" label="Setup" active={tab === 'settings'} onPress={switchTab} styles={styles} erp={erp} />
        ) : null}
      </View>
    </View>
  )
}

function Field({
  label,
  value,
  onChangeText,
  erp,
  multiline,
  keyboardType
}: {
  label: string
  value: string
  onChangeText: (v: string) => void
  erp: ErpTheme
  multiline?: boolean
  keyboardType?: 'default' | 'decimal-pad'
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: erp.textSubtle, marginBottom: 4 }}>
        {label}
      </Text>
      <TextInput
        style={{
          borderWidth: 1,
          borderColor: erp.border,
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 10,
          color: erp.text,
          backgroundColor: erp.surface,
          minHeight: multiline ? 80 : undefined,
          textAlignVertical: multiline ? 'top' : 'center'
        }}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        keyboardType={keyboardType}
        placeholderTextColor={erp.textSubtle}
      />
    </View>
  )
}

function NavBtn({
  id,
  icon,
  label,
  active,
  onPress,
  styles,
  erp
}: {
  id: TabId
  icon: string
  label: string
  active: boolean
  onPress: (id: TabId) => void
  styles: ReturnType<typeof createStyles>
  erp: ErpTheme
}) {
  return (
    <Pressable style={styles.navBtn} onPress={() => onPress(id)}>
      <FontAwesome5 name={icon} size={18} color={active ? erp.primary : erp.textSubtle} />
      <Text style={[styles.navLabel, active && { color: erp.primary }]}>{label}</Text>
    </Pressable>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: erp.bg },
    loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scroll: { padding: 12, paddingBottom: 100 },
    policy: { fontSize: 11, color: erp.textSubtle, marginBottom: 8, lineHeight: 16 },
    msg: { fontSize: 13, color: '#b45309', marginBottom: 8 },
    empty: { textAlign: 'center', color: erp.textSubtle, paddingVertical: 32, fontSize: 14 },
    inbox: { gap: 12 },
    docCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: erp.border,
      backgroundColor: erp.surface,
      padding: 14
    },
    docHeader: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    docThumb: {
      width: 56,
      height: 56,
      borderRadius: 10,
      backgroundColor: erp.bg,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden'
    },
    thumbImg: { width: 56, height: 56 },
    docMeta: { flex: 1, gap: 2 },
    docVendor: { fontSize: 16, fontWeight: '700', color: erp.text },
    docDate: { fontSize: 12, color: erp.textSubtle },
    docAlloc: { fontSize: 12, color: erp.textMuted, marginTop: 2 },
    docAmount: { alignItems: 'flex-end' },
    docTotal: { fontSize: 15, fontWeight: '700', color: erp.text },
    docStatus: { fontSize: 10, textTransform: 'uppercase', color: erp.textSubtle, marginTop: 2 },
    docActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    docActionBtn: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: erp.bg
    },
    docActionText: { fontSize: 13, fontWeight: '600', color: erp.primary },
    docDeleteBtn: { marginLeft: 'auto' },
    docDeleteText: { fontSize: 13, fontWeight: '600', color: '#dc2626' },
    captureStack: { gap: 12 },
    card: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: erp.border,
      backgroundColor: erp.surface,
      padding: 14,
      gap: 10
    },
    cardTitle: { fontSize: 16, fontWeight: '700', color: erp.text },
    captureBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: 14
    },
    cameraBtn: { backgroundColor: '#059669' },
    galleryBtn: { borderWidth: 2, borderStyle: 'dashed', borderColor: erp.border },
    captureBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
    galleryBtnText: { color: erp.text },
    preview: { width: '100%', height: 220, borderRadius: 12, backgroundColor: erp.bg },
    hint: { fontSize: 12, color: erp.textSubtle, lineHeight: 17 },
    warn: { fontSize: 13, color: '#b45309' },
    primaryBtn: {
      backgroundColor: erp.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center'
    },
    primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    saveBtn: {
      backgroundColor: '#059669',
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 4
    },
    secondaryBtn: {
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: erp.border
    },
    secondaryBtnText: { color: erp.text, fontWeight: '600' },
    btnDisabled: { opacity: 0.5 },
    fieldLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: erp.textSubtle, marginTop: 4 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
    chip: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: erp.border,
      backgroundColor: erp.bg
    },
    chipActive: { backgroundColor: erp.primary, borderColor: erp.primary },
    chipText: { fontSize: 12, color: erp.text },
    chipTextActive: { color: '#fff', fontWeight: '600' },
    settings: { gap: 12 },
    adminRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    adminInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: erp.border,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      color: erp.text,
      backgroundColor: erp.bg
    },
    adminInputCode: { flex: 0, width: 72 },
    adminAddBtn: {
      backgroundColor: erp.primary,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 10
    },
    adminAddText: { color: '#fff', fontWeight: '700', fontSize: 13 },
    qboOk: { fontSize: 13, color: '#059669', marginBottom: 8 },
    adminListBlock: {
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: erp.border,
      gap: 6
    },
    adminListItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center'
    },
    adminListText: { fontSize: 14, color: erp.text, flex: 1 },
    exportBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: erp.border,
      backgroundColor: erp.surface,
      marginBottom: 10
    },
    exportBarText: { fontSize: 13, fontWeight: '600', color: erp.primary, flex: 1 },
    bottomNav: {
      flexDirection: 'row',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: erp.border,
      backgroundColor: erp.surface,
      paddingBottom: 8,
      paddingTop: 6
    },
    navBtn: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 6 },
    navLabel: { fontSize: 10, fontWeight: '600', color: erp.textSubtle }
  })
}
