import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { STEP_IDS, STEP_META } from '../WizardContext'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { JcTheme } from '../../theme/palettes'

type Props = {
  currentStep: number
  onSelect: (index: number) => void
}

export function WizardStepBar({ currentStep, onSelect }: Props) {
  const styles = useThemedStyles(createStyles)
  const progress = ((currentStep + 1) / STEP_IDS.length) * 100

  return (
    <View style={styles.wrap}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.steps}
      >
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
                <Text
                  style={[
                    styles.dotText,
                    active && styles.dotTextOnPrimary,
                    complete && !active && styles.dotTextComplete
                  ]}
                >
                  {complete ? '✓' : index + 1}
                </Text>
              </View>
              <Text style={[styles.label, active && styles.labelActive]} numberOfLines={2}>
                {meta?.title || stepId}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

function createStyles({ jc }: { jc: JcTheme }) {
  return StyleSheet.create({
  wrap: {
    backgroundColor: jc.surface,
    borderBottomWidth: 1,
    borderBottomColor: jc.border,
    paddingBottom: jc.space.sm
  },
  progressTrack: {
    height: 4,
    backgroundColor: jc.border,
    marginHorizontal: jc.space.lg
  },
  progressFill: {
    height: 4,
    backgroundColor: jc.primary,
    borderRadius: 2
  },
  steps: {
    flexDirection: 'row',
    paddingHorizontal: jc.space.md,
    paddingTop: jc.space.sm,
    gap: 4
  },
  step: {
    width: 72,
    alignItems: 'center',
    paddingHorizontal: 2
  },
  dot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: jc.surfaceMuted,
    borderWidth: 1,
    borderColor: jc.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4
  },
  dotActive: {
    backgroundColor: jc.primary,
    borderColor: jc.primary
  },
  dotComplete: {
    backgroundColor: jc.primarySoft,
    borderColor: jc.primaryMuted
  },
  dotText: { fontSize: 12, fontWeight: '700', color: jc.textMuted },
  dotTextOnPrimary: { color: '#fff' },
  dotTextComplete: { color: jc.primaryDark },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: jc.textSubtle,
    textAlign: 'center',
    lineHeight: 13
  },
  labelActive: { color: jc.primary, fontWeight: '700' }
  })
}