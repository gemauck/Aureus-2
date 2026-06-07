import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { AIDA_STAGES, AIDA_STAGE_COLORS } from '../pipeline/constants'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'

type StageCount = { stage: string; count: number }

type Props = {
  byAida: StageCount[]
  activeStage?: string
  onStagePress?: (stage: string) => void
}

export function CrmPipelineFunnel({ byAida, activeStage, onStagePress }: Props) {
  const styles = useThemedStyles(createStyles)
  const max = Math.max(1, ...byAida.map((s) => s.count))

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>AIDA funnel</Text>
      <View style={styles.row}>
        {byAida.map(({ stage, count }) => {
          const colors = AIDA_STAGE_COLORS[stage] || AIDA_STAGE_COLORS.Awareness
          const heightPct = Math.max(count > 0 ? 18 : 8, Math.round((count / max) * 100))
          const active = activeStage === stage
          const short =
            stage === 'No Engagement' ? 'None' : stage === 'Awareness' ? 'Aware' : stage.slice(0, 4)
          return (
            <Pressable
              key={stage}
              style={[styles.col, active && styles.colActive]}
              onPress={() => onStagePress?.(stage)}
              disabled={!onStagePress}
            >
              <Text style={[styles.count, { color: colors.fg }]}>{count}</Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      height: `${heightPct}%`,
                      backgroundColor: colors.fg,
                      opacity: count > 0 ? 0.85 : 0.25
                    }
                  ]}
                />
              </View>
              <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
                {short}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    wrap: {
      marginHorizontal: erp.space.lg,
      marginBottom: 8,
      padding: 12,
      borderRadius: erp.radius.md,
      backgroundColor: erp.surface,
      borderWidth: 1,
      borderColor: erp.border
    },
    title: {
      fontSize: 11,
      fontWeight: '800',
      color: erp.textSubtle,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 10
    },
    row: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
    col: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 4,
      paddingHorizontal: 2,
      borderRadius: erp.radius.sm
    },
    colActive: { backgroundColor: erp.primarySoft },
    count: { fontSize: 12, fontWeight: '800', marginBottom: 4 },
    barTrack: {
      width: '100%',
      height: 44,
      borderRadius: 6,
      backgroundColor: erp.surfaceMuted,
      justifyContent: 'flex-end',
      overflow: 'hidden'
    },
    barFill: { width: '100%', borderRadius: 6 },
    label: {
      marginTop: 5,
      fontSize: 9,
      fontWeight: '700',
      color: erp.textMuted,
      textAlign: 'center'
    },
    labelActive: { color: erp.primary }
  })
}
