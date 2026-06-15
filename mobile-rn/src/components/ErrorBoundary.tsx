import React from 'react'
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import * as Updates from 'expo-updates'
import { API_BASE_URL } from '../config'
import { trackError } from '../services/telemetry'
import { useThemedStyles } from '../theme/useThemedStyles'
import type { ErpTheme } from '../theme/palettes'

type Props = { children: React.ReactNode }
type State = { error: Error | null }

const DEFAULT_APK_URL = `${API_BASE_URL}/public/downloads/Abcotronics-ERP-Mobile.apk`

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    trackError(error, 'ErrorBoundary')
    console.error('App crash:', error)
  }

  render() {
    if (this.state.error) {
      const onOtaBundle = Platform.OS === 'android' && Updates.isEnabled && !Updates.isEmbeddedLaunch
      return (
        <ThemedErrorView
          message={this.state.error.message}
          onRetry={() => this.setState({ error: null })}
          onOtaBundle={onOtaBundle}
        />
      )
    }
    return this.props.children
  }
}

function ThemedErrorView({
  message,
  onRetry,
  onOtaBundle
}: {
  message: string
  onRetry: () => void
  onOtaBundle: boolean
}) {
  const styles = useThemedStyles(createStyles)
  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.box}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.message}>{message}</Text>
        {onOtaBundle ? (
          <Text style={styles.hint}>
            This may be a bad over-the-air update. Reinstall the app APK to restore the built-in version, then
            open Settings to check for a fixed JS update.
          </Text>
        ) : null}
        <Pressable style={styles.btn} onPress={onRetry}>
          <Text style={styles.btnText}>Try again</Text>
        </Pressable>
        {onOtaBundle ? (
          <Pressable style={styles.secondaryBtn} onPress={() => void Linking.openURL(DEFAULT_APK_URL)}>
            <Text style={styles.secondaryBtnText}>Download app (APK)</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: erp.bg, justifyContent: 'center', padding: 24 },
    box: { gap: 12 },
    title: { fontSize: 20, fontWeight: '800', color: erp.text },
    message: { fontSize: 14, color: erp.danger, lineHeight: 20 },
    hint: { fontSize: 13, color: erp.textMuted, lineHeight: 19 },
    btn: {
      marginTop: 8,
      backgroundColor: erp.primary,
      padding: 14,
      borderRadius: 12,
      alignItems: 'center'
    },
    btnText: { color: '#fff', fontWeight: '700' },
    secondaryBtn: {
      padding: 14,
      borderRadius: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: erp.border
    },
    secondaryBtnText: { color: erp.text, fontWeight: '600' }
  })
}
