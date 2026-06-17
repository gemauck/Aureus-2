import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native'
import { getOtaUiMessage, subscribeOtaUiPhase, type OtaUiPhase } from '../services/otaUpdateUi'
import { useThemedStyles } from '../theme/useThemedStyles'
import type { ErpTheme } from '../theme/palettes'
import { useTheme } from '../theme/ThemeContext'

export function OtaUpdateOverlay() {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const [phase, setPhase] = useState<OtaUiPhase>('idle')

  useEffect(() => subscribeOtaUiPhase(setPhase), [])

  const visible = phase !== 'idle'
  const message = getOtaUiMessage(phase)

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ActivityIndicator size="large" color={erp.primary} />
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <Text style={styles.hint}>Draft job cards stay saved on this device.</Text>
        </View>
      </View>
    </Modal>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(15, 23, 42, 0.72)',
      padding: 24
    },
    card: {
      width: '100%',
      maxWidth: 320,
      alignItems: 'center',
      gap: 14,
      borderRadius: erp.radius.lg,
      backgroundColor: erp.surface,
      borderWidth: 1,
      borderColor: erp.border,
      paddingHorizontal: 24,
      paddingVertical: 28
    },
    message: {
      color: erp.text,
      fontSize: 16,
      fontWeight: '700',
      textAlign: 'center',
      lineHeight: 22
    },
    hint: {
      color: erp.textMuted,
      fontSize: 13,
      textAlign: 'center',
      lineHeight: 18
    }
  })
}
