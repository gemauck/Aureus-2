import React from 'react'
import { StyleSheet, Text, View, ViewProps } from 'react-native'
import { jc } from '../theme'

type Props = ViewProps & {
  title: string
  subtitle?: string
  accent?: boolean
}

export function SectionCard({ title, subtitle, children, style, accent, ...rest }: Props) {
  return (
    <View style={[styles.card, style]} {...rest}>
      <View style={[styles.accent, accent && styles.accentActive]} />
      <View style={styles.inner}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        <View style={styles.body}>{children}</View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: jc.surface,
    borderRadius: jc.radius.lg,
    marginBottom: jc.space.md,
    overflow: 'hidden',
    ...jc.shadow,
    borderWidth: 1,
    borderColor: jc.border
  },
  accent: {
    height: 3,
    backgroundColor: jc.border
  },
  accentActive: {
    backgroundColor: jc.primary
  },
  inner: { padding: jc.space.lg },
  title: { fontSize: 16, fontWeight: '700', color: jc.text, letterSpacing: -0.2 },
  subtitle: { fontSize: 13, color: jc.textMuted, marginTop: 4, lineHeight: 18 },
  body: { marginTop: jc.space.md, gap: jc.space.sm }
})
