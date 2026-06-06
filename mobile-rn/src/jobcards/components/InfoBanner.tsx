import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { jc } from '../theme'

type Tone = 'info' | 'warning' | 'success'

const tones: Record<Tone, { bg: string; border: string; text: string }> = {
  info: { bg: jc.primarySoft, border: jc.primaryMuted, text: jc.primaryDark },
  warning: { bg: jc.warningSoft, border: jc.warning, text: jc.warning },
  success: { bg: jc.successSoft, border: jc.success, text: jc.success }
}

export function InfoBanner({
  children,
  tone = 'warning'
}: {
  children: React.ReactNode
  tone?: Tone
}) {
  const palette = tones[tone]
  return (
    <View style={[styles.box, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <Text style={[styles.text, { color: palette.text }]}>{children}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
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
