import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import SignatureCanvas from 'react-native-signature-canvas'
import {
  formatTravelDurationMinutes,
  jobSiteMinutesFromDatetimeLocals
} from '../../../../src/components/manufacturing/jobCardActivityDisplay.js'
import { formatWizardDatetimeLabel } from '../../../../src/jobCardWizard/util.js'
import { SECTION_WORK_MEDIA_KEYS } from '../../../../src/jobCardWizard/constants.js'
import { useJobCardWizard } from '../WizardContext'
import { DateTimeField, toDatetimeLocal } from '../components/DateTimeField'
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
    editingMeta
  } = useJobCardWizard()
  const sigRef = useRef<{ clearSignature?: () => void } | null>(null)
  const endTimeInitialized = useRef(false)
  const [scrollEnabled, setScrollEnabled] = useState(true)

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
    let departure = formData.departureFromSite
    if (!departure?.trim()) {
      departure = toDatetimeLocal(new Date())
      setFormData((f) => ({ ...f, departureFromSite: departure }))
    }
    await handleSave({ forceSubmitted: true })
    Alert.alert('Submitted', 'Job card saved and queued for sync if needed.')
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
          <View
            style={styles.sigBox}
            collapsable={false}
            onStartShouldSetResponder={() => true}
            onResponderGrant={() => setScrollEnabled(false)}
            onResponderRelease={() => setScrollEnabled(true)}
            onResponderTerminate={() => setScrollEnabled(true)}
          >
            <Text style={styles.sigHint}>Sign in the box below</Text>
            <SignatureCanvas
              ref={sigRef as React.RefObject<never>}
              onOK={(sig: string) => {
                setFormData((f) => ({ ...f, customerSignature: sig }))
                setSignatureLocked(true)
              }}
              descriptionText="Customer signature"
              webStyle={`.m-signature-pad { box-shadow: none; border: 1px solid ${jc.border}; border-radius: 12px; } .m-signature-pad--body { border: none; }`}
              style={styles.sigCanvas}
              autoClear={false}
            />
            <Pressable
              style={formStyles.ghostBtn}
              onPress={() => sigRef.current?.clearSignature?.()}
            >
              <Text style={formStyles.ghostBtnText}>Clear signature</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.lockedRow}>
            <Text style={styles.locked}>Signature captured</Text>
            <Pressable onPress={() => setSignatureLocked(false)}>
              <Text style={formStyles.ghostBtnText}>Re-sign</Text>
            </Pressable>
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
  sigBox: { height: 240, marginTop: 8 },
  sigHint: { color: jc.textMuted, fontSize: 13, marginBottom: 6 },
  sigCanvas: {
    flex: 1,
    height: 200,
    backgroundColor: jc.surfaceMuted,
    borderRadius: jc.radius.md
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