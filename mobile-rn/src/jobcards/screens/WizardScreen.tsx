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
import { DateTimeField } from '../components/DateTimeField'
import { AssignmentStep } from '../steps/AssignmentStep'
import { VisitStep } from '../steps/VisitStep'
import { WorkStep } from '../steps/WorkStep'
import { StockStep } from '../steps/StockStep'
import { SignoffStep } from '../steps/SignoffStep'
import { jc } from '../theme'

const STEP_COMPONENTS = {
  assignment: AssignmentStep,
  visit: VisitStep,
  work: WorkStep,
  stock: StockStep,
  signoff: SignoffStep
} as const

export function WizardScreen() {
  const { isOnline } = useNetwork()
  const {
    currentStep,
    goToStep,
    handleNext,
    handlePrevious,
    stepError,
    setWizardFlow,
    arrivalConfirmOpen,
    setArrivalConfirmOpen,
    setFormData,
    formData,
    editingMeta,
    isSubmitting
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

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <OfflineBanner visible={!isOnline} />
      <View style={styles.header}>
        <Pressable onPress={() => setWizardFlow('landing')} hitSlop={8}>
          <Text style={styles.back}>← Exit</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{stepMeta?.title || 'Job card'}</Text>
          {formData.projectName ? (
            <Text style={styles.headerSub} numberOfLines={1}>
              {formData.projectName}
            </Text>
          ) : formData.clientName ? (
            <Text style={styles.headerSub} numberOfLines={1}>
              {formData.clientName}
            </Text>
          ) : null}
        </View>
        <Text style={styles.stepCount}>
          {currentStep + 1}/{STEP_IDS.length}
        </Text>
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
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: jc.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: jc.space.lg,
    paddingVertical: jc.space.sm,
    gap: jc.space.sm
  },
  back: { color: jc.primaryDark, fontWeight: '600', fontSize: 15, minWidth: 52 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: jc.text },
  headerSub: { fontSize: 12, color: jc.textMuted, marginTop: 2 },
  stepCount: { fontSize: 13, fontWeight: '700', color: jc.textSubtle },
  body: { padding: jc.space.lg, paddingBottom: 32 },
  signoffWrap: { flex: 1, paddingHorizontal: jc.space.lg },
  errorBox: {
    marginHorizontal: jc.space.lg,
    backgroundColor: '#fef2f2',
    borderRadius: jc.radius.md,
    padding: jc.space.sm,
    borderWidth: 1,
    borderColor: '#fecaca'
  },
  error: { color: jc.danger, fontWeight: '600', fontSize: 14 },
  nav: {
    flexDirection: 'row',
    gap: jc.space.sm,
    padding: jc.space.lg,
    borderTopWidth: 1,
    borderTopColor: jc.border,
    backgroundColor: jc.surface
  },
  navBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: jc.radius.md,
    alignItems: 'center',
    justifyContent: 'center'
  },
  navSecondary: { backgroundColor: jc.surfaceMuted, borderWidth: 1, borderColor: jc.border },
  navSecondaryText: { fontWeight: '700', color: jc.textMuted },
  primary: { backgroundColor: jc.primary },
  primaryText: { fontWeight: '700', color: '#fff', fontSize: 16 },
  disabled: { opacity: 0.45 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    padding: jc.space.xl
  },
  modalCard: {
    backgroundColor: jc.surface,
    borderRadius: jc.radius.xl,
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
  modalBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 }
})
