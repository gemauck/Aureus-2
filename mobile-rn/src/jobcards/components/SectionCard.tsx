import React from 'react'
import { StyleSheet, Text, View, ViewProps } from 'react-native'
import { jc } from '../theme'

type Props = ViewProps & {
  title: string
  subtitle?: string
  accent?: boolean
  badge?: string
}

export function SectionCard({ title, subtitle, children, style, accent, badge, ...rest }: Props) {
  return (
    <View style={[styles.card, style]} {...rest}>
      <View style={[styles.accent, accent && styles.accentActive]} />
      <View style={styles.inner}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {badge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.body}>{children}</View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: jc.surface,
    borderRadius: jc.radius.xl,
    marginBottom: jc.space.md,
    overflow: 'hidden',
    ...jc.shadowSm,
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: jc.space.sm
  },
  headerText: { flex: 1 },
  title: { fontSize: 17, fontWeight: '700', color: jc.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: jc.textMuted, marginTop: 4, lineHeight: 19 },
  badge: {
    backgroundColor: jc.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: jc.radius.sm,
    borderWidth: 1,
    borderColor: jc.primaryMuted
  },
  badgeText: { fontSize: 12, fontWeight: '700', color: jc.primaryDark },
  body: { marginTop: jc.space.md, gap: jc.space.sm }
})
