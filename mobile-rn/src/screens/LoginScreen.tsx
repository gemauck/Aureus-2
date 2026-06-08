import React, { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { FontAwesome5 } from '@expo/vector-icons'
import { API_BASE_URL } from '../services/apiClient'
import { useAuth } from '../state/AuthContext'
import { COMPANY_NAME } from '../theme/appTheme'
import { useThemedStyles } from '../theme/useThemedStyles'
import type { ErpTheme } from '../theme/palettes'
import { useTheme } from '../theme/ThemeContext'

export function LoginScreen() {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { signIn, sessionExpired, clearSessionExpired } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit() {
    setError('')
    clearSessionExpired()
    try {
      setSubmitting(true)
      await signIn(email, password)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed'
      if (/cannot reach/i.test(message)) {
        setError(message)
      } else if (/invalid credentials/i.test(message)) {
        setError(
          'Invalid credentials. Check your email and password, or sign in on the web ERP to confirm your account is active.'
        )
      } else {
        setError(message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.hero}>
          <View style={styles.logo}>
            <FontAwesome5 name="th-large" size={22} color="#fff" />
          </View>
          <Text style={styles.brand}>{COMPANY_NAME}</Text>
          <Text style={styles.tagline}>Enterprise ERP — mobile</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.subtitle}>Use your Abcotronics ERP account</Text>

          {sessionExpired ? (
            <Text style={styles.sessionHint}>
              Your session expired. Sign in again to continue.
            </Text>
          ) : null}

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="you@company.com"
            placeholderTextColor={erp.textSubtle}
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={erp.textSubtle}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={() => void onSubmit()}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.btn, submitting && styles.btnDisabled]}
            disabled={submitting}
            onPress={() => void onSubmit()}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Sign in</Text>
            )}
          </Pressable>

          <Text style={styles.serverHint}>Server: {API_BASE_URL}</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: erp.sidebar },
  flex: { flex: 1, justifyContent: 'center', padding: erp.space.xl },
  hero: { alignItems: 'center', marginBottom: 28 },
  logo: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: erp.sidebarActive,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12
  },
  brand: { fontSize: 26, fontWeight: '800', color: '#fff' },
  tagline: { fontSize: 14, color: erp.sidebarTextMuted, marginTop: 4 },
  card: {
    backgroundColor: erp.surface,
    borderRadius: erp.radius.xl,
    padding: erp.space.xl,
    ...erp.shadow
  },
  title: { fontSize: 22, fontWeight: '800', color: erp.text },
  subtitle: { fontSize: 14, color: erp.textMuted, marginTop: 4, marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: erp.textMuted, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: erp.border,
    borderRadius: erp.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: erp.text,
    backgroundColor: erp.surfaceMuted,
    marginBottom: 14
  },
  error: { color: erp.danger, fontWeight: '600', marginBottom: 10, fontSize: 14 },
  sessionHint: {
    color: erp.warning || erp.primary,
    fontWeight: '600',
    marginBottom: 12,
    fontSize: 14,
    lineHeight: 20
  },
  btn: {
    backgroundColor: erp.primary,
    borderRadius: erp.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  serverHint: { fontSize: 11, color: erp.textSubtle, textAlign: 'center', marginTop: 16 }
  })
}