import React from 'react'
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'


type Props = {
  title: string
  subtitle?: string
  icon?: string
  iconColor?: string
  children: React.ReactNode
  onPressHeader?: () => void
  actionLabel?: string
  onAction?: () => void
  style?: ViewStyle
}

export function WidgetCard({
  title,
  subtitle,
  icon,
  iconColor,
  children,
  onPressHeader,
  actionLabel,
  onAction,
  style
}: Props) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const resolvedIconColor = iconColor ?? erp.primary
  const headerPressable = onPressHeader || onAction

  return (
    <View style={[styles.card, style]}>
      <View style={[styles.accent, { backgroundColor: resolvedIconColor }]} />
      <Pressable
        style={({ pressed }) => [styles.header, pressed && headerPressable && styles.headerPressed]}
        onPress={onPressHeader || onAction}
        disabled={!headerPressable}
      >
        <View style={styles.headerLeft}>
          {icon ? (
            <View style={[styles.iconWrap, { backgroundColor: `${resolvedIconColor}14` }]}>
              <FontAwesome5 name={icon as never} size={15} color={resolvedIconColor} />
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        </View>
        {actionLabel && onAction ? (
          <Pressable
            onPress={onAction}
            hitSlop={8}
            style={({ pressed }) => [styles.actionPill, pressed && styles.actionPillPressed]}
          >
            <Text style={styles.action}>{actionLabel}</Text>
            <FontAwesome5 name="chevron-right" size={10} color={erp.primary} />
          </Pressable>
        ) : headerPressable ? (
          <FontAwesome5 name="chevron-right" size={12} color={erp.textSubtle} />
        ) : null}
      </Pressable>
      <View style={styles.body}>{children}</View>
    </View>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
  card: {
    backgroundColor: erp.surface,
    borderRadius: erp.radius.xl,
    overflow: 'hidden',
    ...erp.shadow
  },
  accent: {
    height: 3,
    width: '100%'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: erp.space.md,
    paddingVertical: 16,
    gap: 10
  },
  headerPressed: { backgroundColor: erp.surfaceMuted },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  title: { fontSize: 16, fontWeight: '800', color: erp.text, letterSpacing: -0.2 },
  subtitle: { fontSize: 12, color: erp.textMuted, marginTop: 3 },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: erp.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999
  },
  actionPillPressed: { opacity: 0.85 },
  action: { color: erp.primary, fontWeight: '700', fontSize: 12 },
  body: { paddingHorizontal: erp.space.md, paddingBottom: erp.space.md }
  })
}