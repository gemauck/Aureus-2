import React from 'react'
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'
import { erp } from '../../theme/appTheme'

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
  iconColor = erp.primary,
  children,
  onPressHeader,
  actionLabel,
  onAction,
  style
}: Props) {
  return (
    <View style={[styles.card, style]}>
      <Pressable style={styles.header} onPress={onPressHeader} disabled={!onPressHeader}>
        <View style={styles.headerLeft}>
          {icon ? (
            <View style={[styles.iconWrap, { backgroundColor: `${iconColor}18` }]}>
              <FontAwesome5 name={icon as never} size={14} color={iconColor} />
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        </View>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} hitSlop={8}>
            <Text style={styles.action}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </Pressable>
      <View style={styles.body}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: erp.surface,
    borderRadius: erp.radius.lg,
    borderWidth: 1,
    borderColor: erp.border,
    overflow: 'hidden',
    ...erp.shadowSm
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: erp.space.md,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: erp.borderLight
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  title: { fontSize: 16, fontWeight: '800', color: erp.text },
  subtitle: { fontSize: 12, color: erp.textMuted, marginTop: 2 },
  action: { color: erp.primary, fontWeight: '700', fontSize: 13 },
  body: { padding: erp.space.md }
})
