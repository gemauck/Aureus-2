import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { FontAwesome5 } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAppShell } from '../../components/shell/AppShellContext'
import { erp } from '../../theme/appTheme'

type Props = {
  title: string
  subtitle?: string
  showBack?: boolean
  onBack?: () => void
}

export function ModuleHeader({ title, subtitle, showBack, onBack }: Props) {
  const insets = useSafeAreaInsets()
  const { openMenu } = useAppShell()
  const navigation = useNavigation()

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.row}>
        <Pressable style={styles.menuBtn} onPress={openMenu} hitSlop={8}>
          <FontAwesome5 name="bars" size={18} color={erp.text} />
        </Pressable>
        {showBack ? (
          <Pressable
            style={styles.backBtn}
            onPress={onBack || (() => navigation.goBack())}
            hitSlop={8}
          >
            <FontAwesome5 name="chevron-left" size={14} color={erp.primary} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.backBtn} onPress={() => navigation.navigate('Dashboard' as never)} hitSlop={8}>
            <FontAwesome5 name="th-large" size={14} color={erp.primary} />
            <Text style={styles.backText}>Dashboard</Text>
          </Pressable>
        )}
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: erp.surface,
    borderBottomWidth: 1,
    borderBottomColor: erp.border,
    ...erp.shadowSm
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: erp.space.md,
    paddingVertical: 12,
    gap: 8
  },
  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: erp.radius.md,
    backgroundColor: erp.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center'
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  backText: { color: erp.primary, fontWeight: '700', fontSize: 13 },
  titleBlock: { flex: 1, alignItems: 'flex-end' },
  title: { fontSize: 17, fontWeight: '800', color: erp.text, textAlign: 'right' },
  subtitle: { fontSize: 12, color: erp.textMuted, marginTop: 2, textAlign: 'right' }
})
