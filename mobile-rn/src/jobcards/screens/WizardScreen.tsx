import React, { useMemo } from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { OfflineBanner } from '../../components/OfflineBanner'
import { useNetwork } from '../../hooks/useNetwork'
import { STEP_IDS, STEP_META, useJobCardWizard } from '../WizardContext'
import { WizardStepBar } from '../components/WizardStepBar'
import { DateTimeField, toDatetimeLocal } from '../components/DateTimeField'
import { AssignmentStep } from '../steps/AssignmentStep'
import { VisitStep } from '../steps/VisitStep'
import { WorkStep } from '../steps/WorkStep'
import { StockStep } from '../steps/StockStep'
import { SignoffStep } from '../steps/SignoffStep'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { JcTheme } from '../../theme/palettes'

const STEP_COMPONENTS = {
  assignment: AssignmentStep,
  visit: VisitStep,
  work: WorkStep,
  stock: StockStep,
  signoff: SignoffStep
} as const

export function WizardScreen() {
  const styles = useThemedStyles(createStyles)
  const { isOnline } = useNetwork()
  const {
    currentStep,
    goToStep,
    handleNext,
    handlePrevious,
    handleSave,
    stepError,
    setWizardFlow,
    arrivalConfirmOpen,
    setArrivalConfirmOpen,
    departureConfirmOpen,
    setDepartureConfirmOpen,
    confirmDepartureAndSubmit,
    setFormData,
    formData,
    editingMeta,
    isSubmitting,
    canDeleteJobCards,
    deletingJobCardId,
    deleteJobCard
  } = useJobCardWizard()

  const stepId = STEP_IDS[currentStep] as keyof typeof STEP_COMPONENTS
  const StepComponent = STEP_COMPONENTS[stepId]
  const stepMeta = STEP_META[stepId as keyof typeof STEP_META]
  const isLast = currentStep >= STEP_IDS.length - 1
  const isSignoff = stepId === 'signoff'

  const body = useMemo(() => {
    if (isSignoff) return <SignoffStep />
    return <StepComponent />
  }, [isSignoff, StepComponent])

  const statusLabel = formData.status === 'submitted' ? 'Submitted' : 'Draft'
  const cardRowForDelete = editingMeta
    ? {
        id: editingMeta.localId,
        jobCardNumber: editingMeta.jobCardNumber,
        heading: formData.heading,
        synced: editingMeta.synced,
        source: editingMeta.synced ? 'server' : 'local'
      }
    : null

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <OfflineBanner visible={!isOnline} />
      <View style={styles.header}>
        <Pressable onPress={() => setWizardFlow('landing')} hitSlop={8} style={styles.exitBtn}>
          <Text style={styles.back}>← Exit</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{stepMeta?.title || 'Job card'}</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {stepMeta?.subtitle || 'Guided wizard'}
          </Text>
          {formData.projectName || formData.clientName ? (
            <Text style={styles.headerContext} numberOfLines={1}>
              {formData.projectName || formData.clientName}
            </Text>
          ) : null}
        </View>
        <View style={styles.headerRight}>
          {canDeleteJobCards && cardRowForDelete ? (
            <Pressable
              style={[styles.deleteHeaderBtn, deletingJobCardId ? styles.disabled : null]}
              disabled={Boolean(deletingJobCardId)}
              onPress={() => void deleteJobCard(cardRowForDelete as never)}
              hitSlop={8}
            >
              <Text style={styles.deleteHeaderText}>
                {deletingJobCardId ? '…' : 'Delete'}
              </Text>
            </Pressable>
          ) : null}
          <View style={styles.statusChip}>
            <Text style={styles.statusChipText}>{statusLabel}</Text>
          </View>
          <Text style={styles.stepCount}>
            {currentStep + 1}/{STEP_IDS.length}
          </Text>
        </View>
      </View>
      <WizardStepBar currentStep={currentStep} onSelect={goToStep} />
      {isSignoff ? (
        <View style={styles.signoffWrap}>{body}</View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="always"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
        >
          {body}
        </ScrollView>
      )}
      {stepError ? (
        <View style={styles.errorBox}>
          <Text style={styles.error}>{stepError}</Text>
        </View>
      ) : null}
      {!isSignoff ? (
        <View style={styles.nav}>
          <Pressable
            style={[styles.navBtn, styles.navSecondary, currentStep === 0 && styles.disabled]}
            disabled={currentStep === 0 || isSubmitting}
            onPress={handlePrevious}
          >
            <Text style={styles.navSecondaryText}>Back</Text>
          </Pressable>
          <Pressable
            style={[styles.navBtn, styles.navGhost, isSubmitting && styles.disabled]}
            disabled={isSubmitting}
            onPress={() => void handleSave({ forceDraft: true })}
          >
            <Text style={styles.navGhostText}>Save draft</Text>
          </Pressable>
          {!isLast ? (
            <Pressable
              style={[styles.navBtn, styles.primary, isSubmitting && styles.disabled]}
              disabled={isSubmitting}
              onPress={handleNext}
            >
              <Text style={styles.primaryText}>Continue</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Modal visible={arrivalConfirmOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Start job — set arrival time</Text>
            <Text style={styles.modalSub}>
              Adjust the arrival time if needed, then confirm to begin the wizard.
            </Text>
            <DateTimeField
              label="Arrival on site"
              value={formData.timeOfArrival}
              onChange={(timeOfArrival) => setFormData((f) => ({ ...f, timeOfArrival }))}
            />
            <Pressable
              style={styles.modalBtn}
              onPress={() => {
                setArrivalConfirmOpen(false)
                setFormData((f) => ({
                  ...f,
                  timeOfArrival: f.timeOfArrival || new Date().toISOString().slice(0, 16)
                }))
              }}
            >
              <Text style={styles.modalBtnText}>Confirm & start</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={departureConfirmOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Confirm departure time</Text>
            <Text style={styles.modalSub}>
              Set when you left the site, then submit the job card.
            </Text>
            <DateTimeField
              label="Departure from site"
              value={formData.departureFromSite || toDatetimeLocal(new Date())}
              onChange={(departureFromSite) => setFormData((f) => ({ ...f, departureFromSite }))}
            />
            <Pressable
              style={styles.modalBtn}
              onPress={() => {
                const v = formData.departureFromSite || toDatetimeLocal(new Date())
                void confirmDepartureAndSubmit(v)
              }}
            >
              <Text style={styles.modalBtnText}>Confirm & submit</Text>
            </Pressable>
            <Pressable style={styles.modalCancel} onPress={() => setDepartureConfirmOpen(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

function createStyles({ jc }: { jc: JcTheme }) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: jc.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: jc.space.lg,
    paddingVertical: jc.space.sm,
    gap: jc.space.sm,
    backgroundColor: jc.surface,
    borderBottomWidth: 1,
    borderBottomColor: jc.border
  },
  exitBtn: { minWidth: 52, paddingTop: 2 },
  back: { color: jc.primary, fontWeight: '600', fontSize: 15 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: jc.text, letterSpacing: -0.3 },
  headerSub: { fontSize: 12, color: jc.textMuted, marginTop: 2 },
  headerContext: { fontSize: 12, color: jc.primaryDark, fontWeight: '600', marginTop: 2 },
  headerRight: { alignItems: 'flex-end', gap: 4 },
  deleteHeaderBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: jc.danger
  },
  deleteHeaderText: { fontSize: 11, fontWeight: '700', color: jc.danger },
  statusChip: {
    backgroundColor: jc.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: jc.primaryMuted
  },
  statusChipText: { fontSize: 10, fontWeight: '700', color: jc.primaryDark, textTransform: 'uppercase' },
  stepCount: { fontSize: 12, fontWeight: '700', color: jc.textSubtle },
  body: { padding: jc.space.lg, paddingBottom: 32 },
  signoffWrap: { flex: 1, paddingHorizontal: jc.space.lg },
  errorBox: {
    marginHorizontal: jc.space.lg,
    backgroundColor: jc.dangerSoft,
    borderRadius: jc.radius.md,
    padding: jc.space.sm,
    borderWidth: 1,
    borderColor: jc.danger
  },
  error: { color: jc.danger, fontWeight: '600', fontSize: 14 },
  nav: {
    flexDirection: 'row',
    gap: jc.space.xs,
    padding: jc.space.md,
    borderTopWidth: 1,
    borderTopColor: jc.border,
    backgroundColor: jc.surface
  },
  navBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: jc.radius.md,
    alignItems: 'center',
    justifyContent: 'center'
  },
  navSecondary: { backgroundColor: jc.surfaceMuted, borderWidth: 1, borderColor: jc.border },
  navSecondaryText: { fontWeight: '700', color: jc.textMuted, fontSize: 14 },
  navGhost: { backgroundColor: jc.surface },
  navGhostText: { fontWeight: '600', color: jc.primary, fontSize: 13 },
  primary: { backgroundColor: jc.primary, flex: 1.2 },
  primaryText: { fontWeight: '700', color: '#fff', fontSize: 15 },
  disabled: { opacity: 0.45 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    justifyContent: 'center',
    padding: jc.space.xl
  },
  modalCard: {
    backgroundColor: jc.surface,
    borderRadius: jc.radius.xxl,
    padding: jc.space.xl,
    gap: jc.space.sm,
    ...jc.shadow
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: jc.text },
  modalSub: { color: jc.textMuted, lineHeight: 22, fontSize: 15 },
  modalBtn: {
    backgroundColor: jc.primary,
    padding: 14,
    borderRadius: jc.radius.md,
    alignItems: 'center',
    marginTop: jc.space.sm
  },
  modalBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  modalCancel: { paddingVertical: 10, alignItems: 'center' },
  modalCancelText: { color: jc.textMuted, fontWeight: '600' }
  })
}