import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import SignatureCanvas from 'react-native-signature-canvas'
import {
  formatTravelDurationMinutes,
  jobSiteMinutesFromDatetimeLocals
} from '../../../../src/components/manufacturing/jobCardActivityDisplay.js'
import { formatWizardDatetimeLabel } from '../../../../src/jobCardWizard/util.js'
import { SECTION_WORK_MEDIA_KEYS } from '../../../../src/jobCardWizard/constants.js'
import { useJobCardWizard } from '../WizardContext'
import { toDatetimeLocal } from '../components/DateTimeField'
import { SectionCard } from '../components/SectionCard'
import { SummaryRow } from '../components/SummaryRow'
import { useFormStyles } from '../components/formStyles'
import { PhotoPickerSection } from '../media/PhotoPickerSection'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { JcTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'

export function SignoffStep() {
  const formStyles = useFormStyles()
  const styles = useThemedStyles(createStyles)
  const { jc } = useTheme()
  const {
    formData,
    setFormData,
    handleSave,
    isSubmitting,
    signatureLocked,
    setSignatureLocked,
    photosLoading,
    selectedPhotos,
    setSelectedPhotos,
    sectionWorkMedia,
    clients,
    projects,
    editingMeta,
    setWizardFlow,
    refreshPriorList
  } = useJobCardWizard()
  const sigRef = useRef<{ clearSignature?: () => void; readSignature?: () => void } | null>(null)
  const endTimeInitialized = useRef(false)
  const [scrollEnabled, setScrollEnabled] = useState(true)
  const [hasSignature, setHasSignature] = useState(false)
  const [savingSignature, setSavingSignature] = useState(false)

  const signatureWebStyle = useMemo(
    () =>
      `.m-signature-pad { box-shadow: none; border: 1px solid ${jc.border}; border-radius: 12px; height: 100%; }` +
      `.m-signature-pad--body { border: none; position: absolute; left: 0; right: 0; top: 0; bottom: 0; height: auto; }` +
      `.m-signature-pad--footer { display: none; }`,
    [jc.border]
  )

  useEffect(() => {
    if (endTimeInitialized.current) return
    endTimeInitialized.current = true
    if (!formData.departureFromSite?.trim()) {
      setFormData((f) => ({ ...f, departureFromSite: toDatetimeLocal(new Date()) }))
    }
    if (!formData.customerSignDate?.trim()) {
      setFormData((f) => ({
        ...f,
        customerSignDate: new Date().toISOString().slice(0, 10)
      }))
    }
  }, [formData.departureFromSite, formData.customerSignDate, setFormData])

  const jobSiteDurationLabel = useMemo(() => {
    const mins = jobSiteMinutesFromDatetimeLocals(
      formData.timeOfArrival,
      formData.departureFromSite
    )
    return formatTravelDurationMinutes(mins)
  }, [formData.timeOfArrival, formData.departureFromSite])

  const totalMaterialCost = useMemo(
    () => (formData.materialsBought || []).reduce((sum, item) => sum + (item.cost || 0), 0),
    [formData.materialsBought]
  )

  const totalPhotoVideoCount = useMemo(() => {
    const sectionCount = SECTION_WORK_MEDIA_KEYS.reduce(
      (n, k) => n + (sectionWorkMedia[k]?.length || 0),
      0
    )
    return selectedPhotos.length + sectionCount
  }, [selectedPhotos, sectionWorkMedia])

  const projectLabel =
    formData.projectName ||
    projects.find((p) => String(p.id) === String(formData.projectId))?.name ||
    ''

  const clientLabel =
    formData.clientName || clients.find((c) => c.id === formData.clientId)?.name || ''

  async function submitCard() {
    if (!signatureLocked || !formData.customerSignature?.trim()) {
      Alert.alert(
        'Signature required',
        'Ask the customer to sign in the box, then tap Save signature before submitting.'
      )
      return
    }
    const departure =
      formData.departureFromSite?.trim() || toDatetimeLocal(new Date())
    if (!formData.departureFromSite?.trim()) {
      setFormData((f) => ({ ...f, departureFromSite: departure }))
    }

    const result = await handleSave({
      forceSubmitted: true,
      departureFromSiteOverride: departure
    })

    if (!result.ok && !result.persisted) {
      Alert.alert('Could not submit', result.error || 'Please try again.')
      return
    }

    if (result.synced) {
      Alert.alert(
        'Submitted',
        'Job card saved to the server.',
        [{ text: 'OK', onPress: () => setWizardFlow('landing') }]
      )
      void refreshPriorList()
      return
    }

    const detail = result.error ? `\n\n${result.error}` : ''
    Alert.alert(
      'Saved on this device',
      `Your job card is stored safely and queued to sync.${detail}\n\nOpen "View or edit existing" or Pending uploads to retry if needed.`,
      [{ text: 'OK', onPress: () => setWizardFlow('landing') }]
    )
    void refreshPriorList()
  }

  function saveSignature() {
    setSavingSignature(true)
    sigRef.current?.readSignature?.()
  }

  function clearSignature() {
    setHasSignature(false)
    setFormData((f) => ({ ...f, customerSignature: '' }))
    sigRef.current?.clearSignature?.()
  }

  function startResign() {
    setSignatureLocked(false)
    setHasSignature(false)
    setFormData((f) => ({ ...f, customerSignature: '' }))
    sigRef.current?.clearSignature?.()
  }

  return (
    <ScrollView
      keyboardShouldPersistTaps="always"
      nestedScrollEnabled
      scrollEnabled={scrollEnabled}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
    >
      <SectionCard
        title="End of job"
        subtitle="Select when you left the site. Total time is calculated from arrival."
        accent
      >
        {formData.timeOfArrival ? (
          <Text style={styles.arrivalReadout}>
            Arrival on site:{' '}
            <Text style={styles.arrivalValue}>
              {formatWizardDatetimeLabel(formData.timeOfArrival)}
            </Text>
          </Text>
        ) : null}
        <DateTimeField
          label="Departure from site *"
          value={formData.departureFromSite}
          onChange={(departureFromSite) => setFormData((f) => ({ ...f, departureFromSite }))}
        />
        <Pressable
          style={formStyles.ghostBtn}
          onPress={() =>
            setFormData((f) => ({ ...f, departureFromSite: toDatetimeLocal(new Date()) }))
          }
        >
          <Text style={formStyles.ghostBtnText}>Use current time</Text>
        </Pressable>
        <View style={styles.durationBox}>
          <Text style={formStyles.label}>Total time on job</Text>
          <Text style={styles.durationValue}>{jobSiteDurationLabel || '—'}</Text>
        </View>
      </SectionCard>

      <SectionCard
        title="Attachments"
        subtitle="Capture supporting photos or videos from site."
        badge={totalPhotoVideoCount ? `${totalPhotoVideoCount}` : undefined}
      >
        {photosLoading ? (
          <Text style={styles.loading}>Loading uploaded photos…</Text>
        ) : null}
        <PhotoPickerSection photos={selectedPhotos} onChange={setSelectedPhotos} />
      </SectionCard>

      <SectionCard title="Customer sign-off" subtitle="Feedback and signature from the customer.">
        <TextInput
          style={formStyles.input}
          placeholder="Customer name"
          placeholderTextColor={jc.textSubtle}
          value={formData.customerName}
          onChangeText={(customerName) => setFormData((f) => ({ ...f, customerName }))}
        />
        <TextInput
          style={formStyles.input}
          placeholder="Customer title"
          placeholderTextColor={jc.textSubtle}
          value={formData.customerTitle}
          onChangeText={(customerTitle) => setFormData((f) => ({ ...f, customerTitle }))}
        />
        <TextInput
          style={[formStyles.input, formStyles.multiline]}
          multiline
          placeholder="Customer feedback"
          placeholderTextColor={jc.textSubtle}
          value={formData.customerFeedback}
          onChangeText={(customerFeedback) => setFormData((f) => ({ ...f, customerFeedback }))}
        />
        <DateTimeField
          label="Sign date"
          value={formData.customerSignDate}
          onChange={(customerSignDate) => setFormData((f) => ({ ...f, customerSignDate }))}
          mode="date"
        />
        {!signatureLocked ? (
          <View style={styles.sigBox} collapsable={false}>
            <Text style={styles.sigHint}>Sign in the box below, then tap Save signature.</Text>
            <View style={styles.sigCanvasWrap}>
              <SignatureCanvas
                ref={sigRef as React.RefObject<never>}
                onBegin={() => {
                  setScrollEnabled(false)
                  setHasSignature(true)
                }}
                onEnd={() => setScrollEnabled(true)}
                onOK={(sig: string) => {
                  setFormData((f) => ({ ...f, customerSignature: sig }))
                  setSignatureLocked(true)
                  setSavingSignature(false)
                }}
                onEmpty={() => {
                  setSavingSignature(false)
                  Alert.alert('Empty signature', 'Ask the customer to sign in the box first.')
                }}
                onClear={() => setHasSignature(false)}
                onError={() => {
                  setSavingSignature(false)
                  Alert.alert('Signature pad', 'Could not load the signature pad. Try again.')
                }}
                descriptionText="Customer signature"
                confirmText="Save"
                clearText="Clear"
                webStyle={signatureWebStyle}
                style={styles.sigCanvas}
                nestedScrollEnabled
                autoClear={false}
                penColor="#111827"
                backgroundColor="#ffffff"
              />
            </View>
            <View style={styles.sigActions}>
              <Pressable
                style={[
                  styles.saveSigBtn,
                  (!hasSignature || savingSignature) && styles.saveSigBtnDisabled
                ]}
                disabled={!hasSignature || savingSignature}
                onPress={saveSignature}
              >
                {savingSignature ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveSigBtnText}>Save signature</Text>
                )}
              </Pressable>
              <Pressable
                style={formStyles.ghostBtn}
                disabled={!hasSignature || savingSignature}
                onPress={clearSignature}
              >
                <Text style={formStyles.ghostBtnText}>Clear</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.lockedBlock}>
            {formData.customerSignature ? (
              <Image
                source={{ uri: formData.customerSignature }}
                style={styles.sigPreview}
                resizeMode="contain"
              />
            ) : null}
            <View style={styles.lockedRow}>
              <Text style={styles.locked}>Signature saved — safe to scroll</Text>
              <Pressable onPress={startResign}>
                <Text style={formStyles.ghostBtnText}>Clear and re-sign</Text>
              </Pressable>
            </View>
          </View>
        )}
      </SectionCard>

      <SectionCard title="Submission summary" subtitle="Quick review before submitting this job card.">
        <SummaryRow label="Heading" value={formData.heading} />
        <SummaryRow label="Technician" value={formData.agentName} />
        <SummaryRow label="Project" value={projectLabel} />
        <SummaryRow label="Client" value={clientLabel} />
        <SummaryRow label="Site" value={formData.siteName} />
        {editingMeta?.useNewJobTimeFlow ? (
          <>
            <SummaryRow
              label="Arrival on site"
              value={
                formData.timeOfArrival ? formatWizardDatetimeLabel(formData.timeOfArrival) : ''
              }
            />
            <SummaryRow
              label="Departure from site"
              value={
                formData.departureFromSite
                  ? formatWizardDatetimeLabel(formData.departureFromSite)
                  : ''
              }
            />
          </>
        ) : null}
        <SummaryRow label="Time on job" value={jobSiteDurationLabel} />
        <SummaryRow
          label="Stock lines"
          value={formData.stockUsed.length ? String(formData.stockUsed.length) : ''}
        />
        <SummaryRow
          label="Materials cost"
          value={totalMaterialCost > 0 ? `R ${totalMaterialCost.toFixed(2)}` : ''}
        />
        <SummaryRow label="Future work" value={formData.futureWorkRequired} />
        <SummaryRow
          label="Follow-up schedule"
          value={
            formData.futureWorkScheduledAt
              ? new Date(formData.futureWorkScheduledAt).toLocaleString()
              : ''
          }
        />
        <SummaryRow
          label="Photos / video"
          value={totalPhotoVideoCount ? String(totalPhotoVideoCount) : ''}
        />
        <SummaryRow
          label="Customer signature"
          value={signatureLocked || formData.customerSignature ? 'Captured' : 'Pending'}
        />
        {formData.stockUsed.length > 0 ? (
          <View style={styles.stockSummary}>
            <Text style={formStyles.label}>Stock used</Text>
            {formData.stockUsed.map((item) => (
              <Text key={item.id || `${item.sku}-${item.locationId}`} style={styles.stockLine}>
                {item.itemName || item.sku} × {item.quantity} @ {item.locationName || 'site'}
              </Text>
            ))}
          </View>
        ) : null}
      </SectionCard>

      <Pressable
        style={[styles.submitBtn, isSubmitting && styles.disabled]}
        disabled={isSubmitting}
        onPress={() => void submitCard()}
      >
        <Text style={styles.submitText}>{isSubmitting ? 'Submitting…' : 'Submit job card'}</Text>
      </Pressable>

      <Pressable style={formStyles.ghostBtn} onPress={() => void handleSave({ forceDraft: true })}>
        <Text style={formStyles.ghostBtnText}>Save draft</Text>
      </Pressable>
    </ScrollView>
  )
}

function createStyles({ jc }: { jc: JcTheme }) {
  return StyleSheet.create({
  scroll: { paddingBottom: 32 },
  arrivalReadout: { fontSize: 14, color: jc.textMuted, marginBottom: 4 },
  arrivalValue: { fontWeight: '700', color: jc.text },
  durationBox: {
    backgroundColor: jc.surfaceMuted,
    borderRadius: jc.radius.md,
    borderWidth: 1,
    borderColor: jc.border,
    padding: jc.space.md,
    marginTop: jc.space.xs
  },
  durationValue: { fontSize: 16, fontWeight: '700', color: jc.text, marginTop: 4 },
  sigBox: { marginTop: 8, gap: 8 },
  sigHint: { color: jc.textMuted, fontSize: 13 },
  sigCanvasWrap: {
    height: 220,
    borderRadius: jc.radius.md,
    overflow: 'hidden',
    backgroundColor: jc.surfaceMuted
  },
  sigCanvas: {
    flex: 1,
    height: 220,
    backgroundColor: '#fff'
  },
  sigActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  saveSigBtn: {
    backgroundColor: jc.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: jc.radius.md,
    minWidth: 140,
    alignItems: 'center'
  },
  saveSigBtnDisabled: { opacity: 0.5 },
  saveSigBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  lockedBlock: { gap: 8 },
  sigPreview: {
    width: '100%',
    height: 160,
    backgroundColor: jc.surfaceMuted,
    borderRadius: jc.radius.md,
    borderWidth: 1,
    borderColor: jc.border
  },
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: jc.space.md,
    backgroundColor: jc.successSoft,
    borderRadius: jc.radius.md
  },
  locked: { color: jc.success, fontWeight: '700' },
  loading: { color: jc.textMuted, marginBottom: 8, fontSize: 13 },
  stockSummary: { marginTop: jc.space.md, gap: 4 },
  stockLine: { fontSize: 13, color: jc.text, backgroundColor: jc.surfaceMuted, padding: 8, borderRadius: 8 },
  submitBtn: {
    backgroundColor: jc.accentGreen,
    padding: 16,
    borderRadius: jc.radius.lg,
    alignItems: 'center',
    marginTop: jc.space.sm,
    ...jc.shadowSm
  },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  disabled: { opacity: 0.6 }
  })
}