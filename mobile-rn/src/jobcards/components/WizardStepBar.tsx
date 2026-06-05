import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { STEP_IDS, STEP_META } from '../WizardContext'
import { jc } from '../theme'

type Props = {
  currentStep: number
  onSelect: (index: number) => void
}

export function WizardStepBar({ currentStep, onSelect }: Props) {
  const progress = ((currentStep + 1) / STEP_IDS.length) * 100

  return (
    <View style={styles.wrap}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>
      <View style={styles.steps}>
        {STEP_IDS.map((stepId, index) => {
          const meta = STEP_META[stepId as keyof typeof STEP_META]
          const active = index === currentStep
          const complete = index < currentStep
          return (
            <Pressable
              key={stepId}
              onPress={() => onSelect(index)}
              style={styles.step}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <View
                style={[
                  styles.dot,
                  active && styles.dotActive,
                  complete && styles.dotComplete
                ]}
              >
                <Text style={[styles.dotText, (active || complete) && styles.dotTextActive]}>
                  {complete ? '✓' : index + 1}
                </Text>
              </View>
              <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
                {meta?.title || stepId}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: jc.surface,
    borderBottomWidth: 1,
    borderBottomColor: jc.border,
    paddingBottom: jc.space.sm
  },
  progressTrack: {
    height: 3,
    backgroundColor: jc.border,
    marginHorizontal: jc.space.lg
  },
  progressFill: {
    height: 3,
    backgroundColor: jc.primary,
    borderRadius: 2
  },
  steps: {
    flexDirection: 'row',
    paddingHorizontal: jc.space.sm,
    paddingTop: jc.space.sm,
    justifyContent: 'space-between'
  },
  step: { flex: 1, alignItems: 'center', paddingHorizontal: 2 },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: jc.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4
  },
  dotActive: { backgroundColor: jc.primary },
  dotComplete: { backgroundColor: jc.primaryMuted },
  dotText: { fontSize: 12, fontWeight: '700', color: jc.textMuted },
  dotTextActive: { color: jc.primaryDark },
  label: { fontSize: 10, fontWeight: '600', color: jc.textSubtle, textAlign: 'center' },
  labelActive: { color: jc.primary, fontWeight: '700' }
})
