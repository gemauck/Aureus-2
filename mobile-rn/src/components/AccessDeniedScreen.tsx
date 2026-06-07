import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'
import { AppHeader } from './shell/AppHeader'
import { ScreenBody } from './shell/ScreenBody'
import { useThemedStyles } from '../theme/useThemedStyles'
import type { ErpTheme } from '../theme/palettes'
import { useTheme } from '../theme/ThemeContext'

type Props = {
  title?: string
  message?: string
  onBack?: () => void
}

export function AccessDeniedScreen({
  title = 'Access denied',
  message = 'You do not have permission to open this module. Contact your administrator if you need access.',
  onBack
}: Props) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)

  return (
    <View style={styles.root}>
      <AppHeader title={title} showNotifications={false} />
      <ScreenBody>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <FontAwesome5 name="lock" size={28} color={erp.danger} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.desc}>{message}</Text>
          {onBack ? (
            <Pressable style={styles.btn} onPress={onBack}>
              <Text style={styles.btnText}>Go back</Text>
            </Pressable>
          ) : null}
        </View>
      </ScreenBody>
    </View>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: erp.bg },
    card: {
      marginTop: 24,
      backgroundColor: erp.surface,
      borderRadius: erp.radius.xl,
      padding: erp.space.xl,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: erp.border,
      ...erp.shadow
    },
    iconCircle: {
      width: 72,
      height: 72,
      borderRadius: 20,
      backgroundColor: erp.dangerSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16
    },
    title: { fontSize: 22, fontWeight: '800', color: erp.text, marginBottom: 8 },
    desc: { fontSize: 15, color: erp.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
    btn: {
      backgroundColor: erp.primary,
      paddingVertical: 14,
      paddingHorizontal: 20,
      borderRadius: erp.radius.md,
      width: '100%',
      alignItems: 'center'
    },
    btnText: { color: '#fff', fontWeight: '700', fontSize: 16 }
  })
}
