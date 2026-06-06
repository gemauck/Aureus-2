import React, { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { JcTheme } from '../../theme/palettes'

type Tone = 'info' | 'warning' | 'success'

export function InfoBanner({
  children,
  tone = 'warning'
}: {
  children: React.ReactNode
  tone?: Tone
}) {
  const { jc } = useTheme()
  const styles = useThemedStyles(createStyles)
  const tones = useMemo(
    () =>
      ({
        info: { bg: jc.primarySoft, border: jc.primaryMuted, text: jc.primaryDark },
        warning: { bg: jc.warningSoft, border: jc.warning, text: jc.warning },
        success: { bg: jc.successSoft, border: jc.success, text: jc.success }
      }) satisfies Record<Tone, { bg: string; border: string; text: string }>,
    [jc]
  )
  const palette = tones[tone]
  return (
    <View style={[styles.box, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <Text style={[styles.text, { color: palette.text }]}>{children}</Text>
    </View>
  )
}

function createStyles({ jc }: { jc: JcTheme }) {
  return StyleSheet.create({
    box: {
      borderWidth: 1,
      borderRadius: jc.radius.md,
      padding: jc.space.md
    },
    text: {
      fontSize: 13,
      lineHeight: 19
    }
  })
}
