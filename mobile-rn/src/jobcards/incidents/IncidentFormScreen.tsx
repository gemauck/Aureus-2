import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import * as FileSystem from 'expo-file-system'
import { Share } from 'react-native'
import { apiUrl } from '../../config'
import { ModuleHeader } from '../../components/shell/ModuleHeader'
import { SearchableSelect } from '../components/SearchableSelect'
import { DateTimeField } from '../components/DateTimeField'
import { useJobCardWizard } from '../WizardContext'
import { useAuth } from '../../state/AuthContext'
import { useNetwork } from '../../hooks/useNetwork'
import { incidentApi } from './incidentApi'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { JcTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'

const INCIDENT_TYPES = [
  'Near Miss',
  'Injury / First Aid',
  'Equipment Failure',
  'Fuel Spill / Leak',
  'Fire',
  'Environmental',
  'Security',
  'Property Damage',
  'Observation',
  'Other'
]

const SEVERITIES = ['Low', 'Medium', 'High', 'Critical']

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_investigation', label: 'Under investigation' },
  { value: 'closed', label: 'Closed' }
]

function toDatetimeLocal(value?: string | null) {
  if (!value) return new Date().toISOString().slice(0, 16)
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return new Date().toISOString().slice(0, 16)
  return dt.toISOString().slice(0, 16)
}

export function IncidentFormScreen() {
  const styles = useThemedStyles(createStyles)
  const { jc } = useTheme()
  const { accessToken, user } = useAuth()
  const { isOnline } = useNetwork()
  const {
    clients,
    setWizardFlow,
    incidentPrefill,
    editingIncidentId,
    openIncidentList
  } = useJobCardWizard()

  const [loading, setLoading] = useState(Boolean(editingIncidentId))
  const [clientId, setClientId] = useState(incidentPrefill?.clientId || '')
  const [clientName, setClientName] = useState(incidentPrefill?.clientName || '')
  const [siteName, setSiteName] = useState(incidentPrefill?.siteName || '')
  const [jobCardId, setJobCardId] = useState(incidentPrefill?.jobCardId || '')
  const [jobCardNumber, setJobCardNumber] = useState(incidentPrefill?.jobCardNumber || '')
  const [incidentAt, setIncidentAt] = useState(toDatetimeLocal())
  const [incidentType, setIncidentType] = useState('')
  const [severity, setSeverity] = useState('')
  const [status, setStatus] = useState('draft')
  const [description, setDescription] = useState('')
  const [immediateActions, setImmediateActions] = useState('')
  const [relevantAssets, setRelevantAssets] = useState('')
  const [relevantTanksMobileBowsers, setRelevantTanksMobileBowsers] = useState('')
  const [technicianName, setTechnicianName] = useState('')
  const [authorName, setAuthorName] = useState(user?.name || user?.email || '')
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState(editingIncidentId || '')
  const [incidentNumber, setIncidentNumber] = useState('')
  const [sharingPdf, setSharingPdf] = useState(false)

  const clientOptions = useMemo(
    () => clients.map((c) => ({ value: c.id, label: c.name || c.id })),
    [clients]
  )

  useEffect(() => {
    if (!editingIncidentId || !accessToken) {
      if (incidentPrefill) {
        setClientId(incidentPrefill.clientId || '')
        setClientName(incidentPrefill.clientName || '')
        setSiteName(incidentPrefill.siteName || '')
        setJobCardId(incidentPrefill.jobCardId || '')
        setJobCardNumber(incidentPrefill.jobCardNumber || '')
      }
      setLoading(false)
      return
    }
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const res = await incidentApi.get(accessToken, editingIncidentId)
        const row = res.incidentReport
        if (cancelled || !row) return
        setSavedId(row.id)
        setIncidentNumber(row.incidentNumber || '')
        setClientId(row.clientId || '')
        setClientName(row.clientName || '')
        setSiteName(row.siteName || '')
        setJobCardId(row.jobCardId || '')
        setJobCardNumber(row.jobCardNumber || '')
        setIncidentAt(toDatetimeLocal(row.incidentAt))
        setIncidentType(row.incidentType || '')
        setSeverity(row.severity || '')
        setStatus(row.status || 'draft')
        setDescription(row.description || '')
        setImmediateActions(row.immediateActions || '')
        setRelevantAssets(row.relevantAssets || '')
        setRelevantTanksMobileBowsers(row.relevantTanksMobileBowsers || '')
        setTechnicianName(row.technicianName || '')
        setAuthorName(row.authorName || user?.name || user?.email || '')
      } catch (e) {
        Alert.alert('Load failed', e instanceof Error ? e.message : 'Could not load incident')
        setWizardFlow('incident_list')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken, editingIncidentId, incidentPrefill, setWizardFlow])

  const buildPayload = useCallback(
    () => ({
      clientId: clientId || null,
      clientName,
      siteName,
      jobCardId: jobCardId || null,
      jobCardNumber,
      incidentAt: incidentAt ? new Date(incidentAt).toISOString() : new Date().toISOString(),
      incidentType,
      severity,
      description,
      immediateActions,
      relevantAssets,
      relevantTanksMobileBowsers,
      technicianName,
      authorName,
      reportedByName: authorName || user?.name || user?.email || '',
      status
    }),
    [
      clientId,
      clientName,
      siteName,
      jobCardId,
      jobCardNumber,
      incidentAt,
      incidentType,
      severity,
      description,
      immediateActions,
      relevantAssets,
      relevantTanksMobileBowsers,
      technicianName,
      authorName,
      status,
      user
    ]
  )

  const save = useCallback(async () => {
    if (!accessToken) return
    if (!clientId && !clientName.trim()) {
      Alert.alert('Client required', 'Select a client before saving.')
      return
    }
    if (!description.trim()) {
      Alert.alert('Description required', 'Describe what happened.')
      return
    }
    if (!isOnline) {
      Alert.alert('Offline', 'Incident reports require an internet connection to save.')
      return
    }
    setSaving(true)
    try {
      const payload = buildPayload()
      const res = savedId
        ? await incidentApi.patch(accessToken, savedId, payload)
        : await incidentApi.create(accessToken, payload)
      const row = res.incidentReport
      if (row?.id) setSavedId(row.id)
      if (row?.incidentNumber) setIncidentNumber(row.incidentNumber)
      Alert.alert(
        'Saved',
        row?.incidentNumber ? `Incident ${row.incidentNumber} saved.` : 'Incident report saved.'
      )
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : 'Could not save incident report')
    } finally {
      setSaving(false)
    }
  }, [accessToken, buildPayload, clientId, clientName, description, isOnline, savedId])

  const sharePdf = useCallback(async () => {
    if (!accessToken || !savedId) {
      Alert.alert('Save first', 'Save the incident report before sharing PDF.')
      return
    }
    if (!isOnline) {
      Alert.alert('Offline', 'PDF download requires an internet connection.')
      return
    }
    setSharingPdf(true)
    try {
      const url = apiUrl(incidentApi.pdfUrl(savedId))
      const dest = `${FileSystem.cacheDirectory}incident-${savedId}.pdf`
      const result = await FileSystem.downloadAsync(url, dest, {
        headers: { Authorization: `Bearer ${accessToken}` }
      })
      await Share.share({
        url: result.uri,
        title: 'Incident report PDF',
        message: incidentNumber ? `Incident ${incidentNumber}` : 'Incident report PDF'
      })
    } catch (e) {
      Alert.alert('PDF failed', e instanceof Error ? e.message : 'Could not download PDF')
    } finally {
      setSharingPdf(false)
    }
  }, [accessToken, incidentNumber, isOnline, savedId])

  if (loading) {
    return (
      <View style={styles.root}>
        <ModuleHeader
          title="Incident report"
          subtitle="Loading…"
          onBack={() => setWizardFlow(editingIncidentId ? 'incident_list' : 'landing')}
        />
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={jc.primary} size="large" />
        </View>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <ModuleHeader
        title={incidentNumber || 'Incident report'}
        subtitle="Record site incidents"
        onBack={() => setWizardFlow(editingIncidentId ? 'incident_list' : 'landing')}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SearchableSelect
          label="Client"
          value={clientId}
          options={clientOptions}
          onChange={(id) => {
            setClientId(id)
            const hit = clients.find((c) => c.id === id)
            setClientName(hit?.name || '')
          }}
        />
        <Field label="Site name" value={siteName} onChangeText={setSiteName} styles={styles} />
        {jobCardNumber ? (
          <Text style={styles.linked}>Linked job card: {jobCardNumber}</Text>
        ) : null}
        <ChipRow label="Incident type" options={INCIDENT_TYPES} value={incidentType} onSelect={setIncidentType} styles={styles} jc={jc} />
        <ChipRow label="Severity" options={SEVERITIES} value={severity} onSelect={setSeverity} styles={styles} jc={jc} />
        <DateTimeField label="Incident date & time" value={incidentAt} onChange={setIncidentAt} />
        <ChipRow
          label="Status"
          options={STATUS_OPTIONS.map((o) => o.label)}
          value={STATUS_OPTIONS.find((o) => o.value === status)?.label || ''}
          onSelect={(label) => {
            const hit = STATUS_OPTIONS.find((o) => o.label === label)
            if (hit) setStatus(hit.value)
          }}
          styles={styles}
          jc={jc}
        />
        <Field label="Description" value={description} onChangeText={setDescription} multiline styles={styles} />
        <Field label="Immediate actions" value={immediateActions} onChangeText={setImmediateActions} multiline styles={styles} />
        <Field label="Relevant assets" value={relevantAssets} onChangeText={setRelevantAssets} multiline styles={styles} />
        <Field label="Relevant tanks / mobile bowsers" value={relevantTanksMobileBowsers} onChangeText={setRelevantTanksMobileBowsers} multiline styles={styles} />
        <Field label="Technician involved" value={technicianName} onChangeText={setTechnicianName} styles={styles} />
        <Field label="Author (person completing report)" value={authorName} onChangeText={setAuthorName} styles={styles} />

        <View style={styles.actions}>
          <Pressable style={[styles.btn, styles.btnSecondary]} disabled={saving} onPress={() => void save()}>
            <Text style={styles.btnSecondaryText}>{saving ? 'Saving…' : 'Save incident'}</Text>
          </Pressable>
        </View>
        {savedId ? (
          <Pressable style={[styles.btn, styles.btnPdf]} disabled={sharingPdf} onPress={() => void sharePdf()}>
            <Text style={styles.btnPrimaryText}>{sharingPdf ? 'Preparing PDF…' : 'Share PDF'}</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.linkBtn} onPress={() => openIncidentList()}>
          <Text style={styles.linkBtnText}>View all incident reports</Text>
        </Pressable>
      </ScrollView>
    </View>
  )
}

function Field({
  label,
  value,
  onChangeText,
  multiline,
  styles
}: {
  label: string
  value: string
  onChangeText: (v: string) => void
  multiline?: boolean
  styles: ReturnType<typeof createStyles>
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMulti]}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'auto'}
      />
    </View>
  )
}

function ChipRow({
  label,
  options,
  value,
  onSelect,
  styles,
  jc
}: {
  label: string
  options: string[]
  value: string
  onSelect: (v: string) => void
  styles: ReturnType<typeof createStyles>
  jc: JcTheme
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>
        {options.map((opt) => {
          const active = value === opt
          return (
            <Pressable
              key={opt}
              style={[styles.chip, active && { backgroundColor: jc.primary, borderColor: jc.primary }]}
              onPress={() => onSelect(opt)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

function createStyles(jc: JcTheme) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: jc.bg },
    loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    content: { padding: 16, paddingBottom: 40, gap: 12 },
    field: { gap: 6 },
    label: { fontSize: 12, fontWeight: '600', color: jc.textMuted },
    input: {
      borderWidth: 1,
      borderColor: jc.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: jc.text,
      backgroundColor: jc.surface
    },
    inputMulti: { minHeight: 96 },
    linked: { fontSize: 12, color: jc.primary },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      borderWidth: 1,
      borderColor: jc.border,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: jc.surface
    },
    chipText: { fontSize: 12, color: jc.text },
    chipTextActive: { color: '#fff', fontWeight: '600' },
    actions: { marginTop: 8 },
    btn: {
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center'
    },
    btnPrimary: { backgroundColor: jc.primary },
    btnSecondary: { borderWidth: 1, borderColor: jc.border, backgroundColor: jc.surface },
    btnPdf: { backgroundColor: jc.primaryDark, marginTop: 4 },
    btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    btnSecondaryText: { color: jc.text, fontWeight: '600', fontSize: 14 },
    linkBtn: { alignItems: 'center', paddingVertical: 8 },
    linkBtnText: { color: jc.primary, fontWeight: '600', fontSize: 13 }
  })
}
