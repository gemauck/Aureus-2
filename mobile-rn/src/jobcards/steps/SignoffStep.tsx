import React, { useEffect, useRef, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import SignatureCanvas from 'react-native-signature-canvas'
import { useJobCardWizard } from '../WizardContext'
import { DateTimeField, toDatetimeLocal } from '../components/DateTimeField'
import { SectionCard } from '../components/SectionCard'
import { jc } from '../theme'
import { PhotoPickerSection } from '../media/PhotoPickerSection'

export function SignoffStep() {
  const {
    formData,
    setFormData,
    handleSave,
    isSubmitting,
    signatureLocked,
    setSignatureLocked,
    photosLoading,
    selectedPhotos,
    setSelectedPhotos
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
      <SectionCard title="Job times" subtitle="Adjust end time before submitting." accent>
        <DateTimeField
          label="Arrival on site"
          value={formData.timeOfArrival}
          onChange={(timeOfArrival) => setFormData((f) => ({ ...f, timeOfArrival }))}
        />
        <DateTimeField
          label="End / departure time"
          value={formData.departureFromSite}
          onChange={(departureFromSite) => setFormData((f) => ({ ...f, departureFromSite }))}
        />
      </SectionCard>

      <SectionCard title="Attachments" subtitle="Photos and videos from site.">
        {photosLoading ? (
          <Text style={styles.loading}>Loading uploaded photos…</Text>
        ) : null}
        <PhotoPickerSection photos={selectedPhotos} onChange={setSelectedPhotos} />
      </SectionCard>

      <SectionCard title="Customer sign-off">
        <TextInput
          style={styles.input}
          placeholder="Customer name"
          value={formData.customerName}
          onChangeText={(customerName) => setFormData((f) => ({ ...f, customerName }))}
        />
        <TextInput
          style={styles.input}
          placeholder="Customer title"
          value={formData.customerTitle}
          onChangeText={(customerTitle) => setFormData((f) => ({ ...f, customerTitle }))}
        />
        <TextInput
          style={[styles.input, styles.multiline]}
          multiline
          placeholder="Customer feedback"
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
              webStyle={`.m-signature-pad { box-shadow: none; border: 1px solid #e8f0f8; border-radius: 12px; } .m-signature-pad--body { border: none; }`}
              style={styles.sigCanvas}
              autoClear={false}
            />
            <Pressable
              style={styles.secondaryBtn}
              onPress={() => sigRef.current?.clearSignature?.()}
            >
              <Text style={styles.secondaryBtnText}>Clear signature</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.lockedRow}>
            <Text style={styles.locked}>Signature captured</Text>
            <Pressable onPress={() => setSignatureLocked(false)}>
              <Text style={styles.reSign}>Re-sign</Text>
            </Pressable>
          </View>
        )}
      </SectionCard>

      <Pressable
        style={[styles.submitBtn, isSubmitting && styles.disabled]}
        disabled={isSubmitting}
        onPress={() => void submitCard()}
      >
        <Text style={styles.submitText}>{isSubmitting ? 'Submitting…' : 'Submit job card'}</Text>
      </Pressable>

      <Pressable style={styles.draftBtn} onPress={() => void handleSave({ forceDraft: true })}>
        <Text style={styles.draftText}>Save draft</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 24 },
  input: {
    borderWidth: 1,
    borderColor: jc.border,
    borderRadius: jc.radius.md,
    padding: 14,
    fontSize: 16,
    backgroundColor: jc.surface,
    marginBottom: 8,
    color: jc.text
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  sigBox: { height: 240, marginTop: 8 },
  sigHint: { color: jc.textMuted, fontSize: 13, marginBottom: 6 },
  sigCanvas: { flex: 1, height: 200, backgroundColor: jc.surfaceMuted, borderRadius: jc.radius.md },
  secondaryBtn: { padding: 10, alignItems: 'center' },
  secondaryBtnText: { color: jc.primaryDark, fontWeight: '600' },
  lockedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12 },
  locked: { color: jc.success, fontWeight: '700' },
  reSign: { color: jc.primaryDark, fontWeight: '600' },
  loading: { color: jc.textMuted, marginBottom: 8, fontSize: 13 },
  submitBtn: {
    backgroundColor: jc.accentGreen,
    padding: 16,
    borderRadius: jc.radius.lg,
    alignItems: 'center',
    marginTop: 8
  },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  draftBtn: { padding: 14, alignItems: 'center' },
  draftText: { color: jc.textMuted, fontWeight: '600' },
  disabled: { opacity: 0.6 }
})
