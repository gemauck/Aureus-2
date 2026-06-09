import React, { useCallback, useMemo } from 'react'
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import {
  formatTravelDurationMinutes,
  jobSiteMinutesFromDatetimeLocals
} from '../../../../src/components/manufacturing/jobCardActivityDisplay.js'
import { formatWizardDatetimeLabel } from '../../../../src/jobCardWizard/util.js'
import { JOB_CARD_CALL_OUT_CATEGORY_OPTIONS } from '../../../../src/jobCardWizard/constants.js'
import { useJobCardWizard } from '../WizardContext'
import { DateTimeField } from '../components/DateTimeField'
import { SectionCard } from '../components/SectionCard'
import { SearchableSelect } from '../components/SearchableSelect'
import { useFormStyles } from '../components/formStyles'
import { VoiceNoteField } from '../media/VoiceNoteField'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { JcTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'
import { useAuth } from '../../state/AuthContext'
import { incidentApi } from '../incidents/incidentApi'
import { buildIncidentPrefillFromJobCard } from '../incidents/jobCardToIncidentPrefill'

type LocationPickerProps = React.ComponentProps<
  typeof import('../map/LocationPickerModal').LocationPickerModal
>

function DeferredLocationPickerModal(props: LocationPickerProps) {
  const { jc } = useTheme()
  const deferredStyles = useThemedStyles(createDeferredStyles)
  const [Picker, setPicker] = React.useState<React.ComponentType<LocationPickerProps> | null>(null)

  React.useEffect(() => {
    if (!props.visible) return
    let cancelled = false
    void import('../map/LocationPickerModal').then((mod) => {
      if (!cancelled) setPicker(() => mod.LocationPickerModal)
    })
    return () => {
      cancelled = true
    }
  }, [props.visible])

  if (!props.visible) return null
  if (!Picker) {
    return (
      <Modal visible animationType="slide" onRequestClose={props.onClose}>
        <View style={deferredStyles.loading}>
          <ActivityIndicator color={jc.primary} size="large" />
          <Text style={deferredStyles.loadingText}>Loading map…</Text>
        </View>
      </Modal>
    )
  }
  return <Picker {...props} />
}

export function VisitStep() {
  const formStyles = useFormStyles()
  const styles = useThemedStyles(createStyles)
  const { jc } = useTheme()
  const { accessToken, user } = useAuth()
  const {
    formData,
    setFormData,
    editingMeta,
    voiceAttachments,
    setVoiceAttachments,
    saveDraftQuiet,
    openIncidentReport,
    openIncidentForEdit,
    sectionWorkMedia,
    selectedPhotos
  } = useJobCardWizard()
  const afterTranscription = () => void saveDraftQuiet({ forceDraft: true })
  const [mapOpen, setMapOpen] = React.useState(false)

  const handleReportIncident = useCallback(async () => {
    const authorName = String(user?.name || user?.email || '').trim()
    const prefill = buildIncidentPrefillFromJobCard(formData, editingMeta, {
      authorName,
      sectionWorkMedia,
      selectedPhotos
    })
    const serverJobCardId = editingMeta?.serverJobCardId

    const openNew = () => openIncidentReport(prefill)

    if (!accessToken || !serverJobCardId) {
      openNew()
      return
    }

    try {
      const res = await incidentApi.listDraftsForJobCard(accessToken, serverJobCardId)
      const drafts = res.incidentReports || []
      if (!drafts.length) {
        openNew()
        return
      }
      const draft = drafts[0]
      const label = draft.incidentNumber || draft.id
      Alert.alert(
        'Draft incident exists',
        `${label} is already linked to this job card.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Create new', onPress: openNew },
          { text: 'Open existing', onPress: () => openIncidentForEdit(draft.id) }
        ]
      )
    } catch {
      openNew()
    }
  }, [accessToken, editingMeta, formData, openIncidentForEdit, openIncidentReport, sectionWorkMedia, selectedPhotos, user])

  const categoryOptions = useMemo(
    () => JOB_CARD_CALL_OUT_CATEGORY_OPTIONS.map((opt: string) => ({ value: opt, label: opt })),
    []
  )

  const jobSiteDurationLabel = useMemo(() => {
    const mins = jobSiteMinutesFromDatetimeLocals(
      formData.timeOfArrival,
      formData.departureFromSite
    )
    return formatTravelDurationMinutes(mins)
  }, [formData.timeOfArrival, formData.departureFromSite])

  return (
    <View>
      <SectionCard
        title="Call Out Category"
        subtitle="Choose the type of call-out or visit."
      >
        <SearchableSelect
          label="Call out category"
          value={formData.callOutCategory}
          options={categoryOptions}
          onChange={(callOutCategory) => setFormData((f) => ({ ...f, callOutCategory }))}
          placeholder="Select category…"
        />
        <View style={styles.chipWrap}>
          {JOB_CARD_CALL_OUT_CATEGORY_OPTIONS.map((opt: string) => (
            <Pressable
              key={opt}
              style={[styles.chip, formData.callOutCategory === opt && styles.chipActive]}
              onPress={() => setFormData((f) => ({ ...f, callOutCategory: opt }))}
            >
              <Text
                style={formData.callOutCategory === opt ? styles.chipTextActive : styles.chipText}
              >
                {opt}
              </Text>
            </Pressable>
          ))}
        </View>
      </SectionCard>

      <SectionCard
        title="Visit Details"
        subtitle="Capture the customer location and call-out reason."
      >
        <Text style={formStyles.label}>Location</Text>
        <View style={formStyles.row}>
          <TextInput
            style={[formStyles.input, { flex: 1 }]}
            value={formData.location}
            onChangeText={(location) => setFormData((f) => ({ ...f, location }))}
            placeholder="Facility, area or coordinates"
            placeholderTextColor={jc.textSubtle}
          />
          <Pressable style={styles.mapBtn} onPress={() => setMapOpen(true)}>
            <Text style={styles.mapBtnText}>📍 Map</Text>
          </Pressable>
        </View>
        {formData.latitude && formData.longitude ? (
          <Text style={styles.coords}>
            Coordinates: {formData.latitude}, {formData.longitude}
          </Text>
        ) : null}
        <Text style={formStyles.label}>Reason for call out / visit</Text>
        <TextInput
          style={[formStyles.input, formStyles.multiline]}
          multiline
          value={formData.reasonForVisit}
          onChangeText={(reasonForVisit) => setFormData((f) => ({ ...f, reasonForVisit }))}
          placeholder="Why was the technician requested to attend?"
          placeholderTextColor={jc.textSubtle}
        />
        <VoiceNoteField
          section="reasonForVisit"
          voiceClips={voiceAttachments}
          fieldValue={formData.reasonForVisit}
          onFieldChange={(reasonForVisit) => setFormData((f) => ({ ...f, reasonForVisit }))}
          onVoiceSaved={(clip) => setVoiceAttachments((v) => [...v, clip])}
          onVoiceClipUpdate={(id, patch) =>
            setVoiceAttachments((v) => v.map((c) => (c.id === id ? { ...c, ...patch } : c)))
          }
          onRemove={(id) => setVoiceAttachments((v) => v.filter((x) => x.id !== id))}
          onAfterTranscription={afterTranscription}
        />
      </SectionCard>

      <SectionCard
        title="Job Time"
        subtitle={
          editingMeta?.useNewJobTimeFlow
            ? 'Arrival was set when you opened this job. Adjust if needed; departure is on sign-off.'
            : 'Arrival through departure; total time is calculated automatically.'
        }
        accent
      >
        {editingMeta?.useNewJobTimeFlow && formData.timeOfArrival ? (
          <Text style={styles.arrivedLabel}>
            Arrived: {formatWizardDatetimeLabel(formData.timeOfArrival)}
          </Text>
        ) : null}
        <DateTimeField
          label="Arrival on site *"
          value={formData.timeOfArrival}
          onChange={(timeOfArrival) => setFormData((f) => ({ ...f, timeOfArrival }))}
        />
        {!editingMeta?.useNewJobTimeFlow ? (
          <>
            <DateTimeField
              label="Departure from site"
              value={formData.departureFromSite}
              onChange={(departureFromSite) => setFormData((f) => ({ ...f, departureFromSite }))}
            />
            <View style={styles.durationBox}>
              <Text style={formStyles.label}>Total time</Text>
              <Text style={styles.durationValue}>{jobSiteDurationLabel || '—'}</Text>
            </View>
            <TextInput
              style={formStyles.input}
              placeholder="Vehicle used"
              placeholderTextColor={jc.textSubtle}
              value={formData.vehicleUsed}
              onChangeText={(vehicleUsed) => setFormData((f) => ({ ...f, vehicleUsed }))}
            />
            <View style={formStyles.row}>
              <TextInput
                style={[formStyles.input, { flex: 1 }]}
                keyboardType="numeric"
                placeholder="KM before"
                placeholderTextColor={jc.textSubtle}
                value={String(formData.kmReadingBefore || '')}
                onChangeText={(kmReadingBefore) => setFormData((f) => ({ ...f, kmReadingBefore }))}
              />
              <TextInput
                style={[formStyles.input, { flex: 1 }]}
                keyboardType="numeric"
                placeholder="KM after"
                placeholderTextColor={jc.textSubtle}
                value={String(formData.kmReadingAfter || '')}
                onChangeText={(kmReadingAfter) => setFormData((f) => ({ ...f, kmReadingAfter }))}
              />
            </View>
          </>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Incident report"
        subtitle="Record a site incident linked to this job card."
      >
        <Pressable style={styles.incidentBtn} onPress={() => void handleReportIncident()}>
          <Text style={styles.incidentBtnText}>Report incident</Text>
        </Pressable>
      </SectionCard>

      <DeferredLocationPickerModal
        visible={mapOpen}
        initialLatitude={formData.latitude}
        initialLongitude={formData.longitude}
        initialLabel={formData.location}
        onClose={() => setMapOpen(false)}
        onConfirm={({ latitude, longitude, label }) => {
          setFormData((f) => ({
            ...f,
            latitude: String(latitude),
            longitude: String(longitude),
            location: label || f.location
          }))
          setMapOpen(false)
        }}
      />
    </View>
  )
}

function createDeferredStyles({ jc }: { jc: JcTheme }) {
  return StyleSheet.create({
    loading: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: jc.surface,
      gap: 12
    },
    loadingText: { color: jc.textMuted, fontWeight: '600' }
  })
}

function createStyles({ jc }: { jc: JcTheme }) {
  return StyleSheet.create({
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: jc.surfaceMuted,
    borderWidth: 1,
    borderColor: jc.border
  },
  chipActive: { backgroundColor: jc.primary, borderColor: jc.primary },
  chipText: { color: jc.text, fontSize: 12 },
  chipTextActive: { color: '#fff', fontSize: 12, fontWeight: '600' },
  mapBtn: {
    backgroundColor: jc.primary,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: jc.radius.md
  },
  mapBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  coords: { fontSize: 12, color: jc.textMuted, marginTop: -4 },
  arrivedLabel: { fontSize: 14, fontWeight: '600', color: jc.text, marginBottom: 4 },
  durationBox: {
    backgroundColor: jc.surfaceMuted,
    borderRadius: jc.radius.md,
    borderWidth: 1,
    borderColor: jc.border,
    padding: jc.space.md
  },
  durationValue: { fontSize: 16, fontWeight: '700', color: jc.text, marginTop: 4 },
  incidentBtn: {
    backgroundColor: jc.accentOrange,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: jc.radius.md,
    alignItems: 'center'
  },
  incidentBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 }
  })
}