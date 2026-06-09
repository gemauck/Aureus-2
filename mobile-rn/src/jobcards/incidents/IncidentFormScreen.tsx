import React, { useCallback, useMemo, useState } from 'react'
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

export function IncidentFormScreen() {
  const styles = useThemedStyles(createStyles)
  const { jc } = useTheme()
  const { accessToken, user } = useAuth()
  const { isOnline } = useNetwork()
  const { clients, setWizardFlow, incidentPrefill } = useJobCardWizard()

  const [clientId, setClientId] = useState(incidentPrefill?.clientId || '')
  const [clientName, setClientName] = useState(incidentPrefill?.clientName || '')
  const [siteName, setSiteName] = useState(incidentPrefill?.siteName || '')
  const [jobCardId, setJobCardId] = useState(incidentPrefill?.jobCardId || '')
  const [jobCardNumber, setJobCardNumber] = useState(incidentPrefill?.jobCardNumber || '')
  const [incidentType, setIncidentType] = useState('')
  const [severity, setSeverity] = useState('')
  const [description, setDescription] = useState('')
  const [immediateActions, setImmediateActions] = useState('')
  const [equipmentInvolved, setEquipmentInvolved] = useState('')
  const [witnesses, setWitnesses] = useState('')
  const [locationDescription, setLocationDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState('')
  const [sharingPdf, setSharingPdf] = useState(false)

  const clientOptions = useMemo(
    () => clients.map((c) => ({ value: c.id, label: c.name || c.id })),
    [clients]
  )

  const buildPayload = useCallback(
    (status: 'draft' | 'submitted') => ({
      clientId: clientId || null,
      clientName,
      siteName,
      jobCardId: jobCardId || null,
      jobCardNumber,
      incidentAt: new Date().toISOString(),
      incidentType,
      severity,
      description,
      immediateActions,
      equipmentInvolved,
      witnesses,
      locationDescription,
      reportedByName: user?.name || user?.email || '',
      status
    }),
    [
      clientId,
      clientName,
      siteName,
      jobCardId,
      jobCardNumber,
      incidentType,
      severity,
      description,
      immediateActions,
      equipmentInvolved,
      witnesses,
      locationDescription,
      user
    ]
  )

  const save = useCallback(
    async (status: 'draft' | 'submitted') => {
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
        const payload = buildPayload(status)
        const res = savedId
          ? await incidentApi.patch(accessToken, savedId, payload)
          : await incidentApi.create(accessToken, payload)
        const row = res.incidentReport
        if (row?.id) setSavedId(row.id)
        Alert.alert(
          status === 'submitted' ? 'Submitted' : 'Saved',
          row?.incidentNumber ? `Incident ${row.incidentNumber} saved.` : 'Incident report saved.'
        )
        if (status === 'submitted') setWizardFlow('landing')
      } catch (e) {
        Alert.alert('Save failed', e instanceof Error ? e.message : 'Could not save incident report')
      } finally {
        setSaving(false)
      }
    },
    [accessToken, buildPayload, clientId, clientName, description, isOnline, savedId, setWizardFlow]
  )

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
        message: 'Incident report PDF'
      })
    } catch (e) {
      Alert.alert('PDF failed', e instanceof Error ? e.message : 'Could not download PDF')
    } finally {
      setSharingPdf(false)
    }
  }, [accessToken, isOnline, savedId])

  return (
    <View style={styles.root}>
      <ModuleHeader
        title="Incident report"
        subtitle="Record site incidents"
        onBack={() => setWizardFlow('landing')}
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
        <Field label="Site" value={siteName} onChangeText={setSiteName} styles={styles} />
        {jobCardNumber ? (
          <Text style={styles.linked}>Linked job card: {jobCardNumber}</Text>
        ) : null}
        <ChipRow label="Type" options={INCIDENT_TYPES} value={incidentType} onSelect={setIncidentType} styles={styles} jc={jc} />
        <ChipRow label="Severity" options={SEVERITIES} value={severity} onSelect={setSeverity} styles={styles} jc={jc} />
        <Field label="What happened" value={description} onChangeText={setDescription} multiline styles={styles} />
        <Field label="Immediate actions" value={immediateActions} onChangeText={setImmediateActions} multiline styles={styles} />
        <Field label="Equipment involved" value={equipmentInvolved} onChangeText={setEquipmentInvolved} styles={styles} />
        <Field label="Witnesses" value={witnesses} onChangeText={setWitnesses} multiline styles={styles} />
        <Field label="Location" value={locationDescription} onChangeText={setLocationDescription} multiline styles={styles} />

        <View style={styles.actions}>
          <Pressable style={[styles.btn, styles.btnSecondary]} disabled={saving} onPress={() => void save('draft')}>
            <Text style={styles.btnSecondaryText}>{saving ? 'Saving…' : 'Save draft'}</Text>
          </Pressable>
          <Pressable style={[styles.btn, styles.btnPrimary]} disabled={saving} onPress={() => void save('submitted')}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Submit</Text>}
          </Pressable>
        </View>
        {savedId ? (
          <Pressable style={[styles.btn, styles.btnPdf]} disabled={sharingPdf} onPress={() => void sharePdf()}>
            <Text style={styles.btnPrimaryText}>{sharingPdf ? 'Preparing PDF…' : 'Share PDF'}</Text>
          </Pressable>
        ) : null}
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
    root: { flex: 1, backgroundColor: jc.background },
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
    actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
    btn: {
      flex: 1,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center'
    },
    btnPrimary: { backgroundColor: jc.primary },
    btnSecondary: { borderWidth: 1, borderColor: jc.border, backgroundColor: jc.surface },
    btnPdf: { backgroundColor: jc.primaryDark, marginTop: 4 },
    btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    btnSecondaryText: { color: jc.text, fontWeight: '600', fontSize: 14 }
  })
}
