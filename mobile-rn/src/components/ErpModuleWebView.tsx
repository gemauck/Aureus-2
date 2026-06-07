import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native'
import { WebView, type WebViewNavigation } from 'react-native-webview'
import { FontAwesome5 } from '@expo/vector-icons'
import { API_BASE_URL } from '../config'
import { useAuth } from '../state/AuthContext'
import type { User } from '../types'
import { useThemedStyles } from '../theme/useThemedStyles'
import type { ErpTheme } from '../theme/palettes'
import { useTheme } from '../theme/ThemeContext'

type Props = {
  webPath: string
  title?: string
  onBack?: () => void
}

function buildAuthInjectionScript(accessToken: string, user: User | null): string {
  return `
    (function() {
      try {
        localStorage.setItem('abcotronics_token', ${JSON.stringify(accessToken)});
        localStorage.setItem('abcotronics_user', ${JSON.stringify(JSON.stringify(user))});
        window.__ERP_MOBILE_EMBED__ = true;
      } catch (e) {}
    })();
    true;
  `
}

export function ErpModuleWebView({ webPath, title, onBack }: Props) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { accessToken, user, refreshAuth } = useAuth()
  const webRef = useRef<WebView>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadNonce, setReloadNonce] = useState(0)

  const uri = useMemo(() => {
    const path = webPath.startsWith('/') ? webPath : `/${webPath}`
    return `${API_BASE_URL}${path}`
  }, [webPath])

  const authScript = useMemo(
    () => (accessToken ? buildAuthInjectionScript(accessToken, user) : 'true;'),
    [accessToken, user]
  )

  const injectAuth = useCallback(() => {
    if (!accessToken || !webRef.current) return
    webRef.current.injectJavaScript(buildAuthInjectionScript(accessToken, user))
  }, [accessToken, user])

  useEffect(() => {
    injectAuth()
  }, [accessToken, user, injectAuth])

  useEffect(() => {
    if (!accessToken) return
    const timer = setInterval(() => {
      void refreshAuth().catch(() => {})
    }, 10 * 60 * 1000)
    return () => clearInterval(timer)
  }, [accessToken, refreshAuth])

  if (!accessToken) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Sign in to open this module.</Text>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        {onBack ? (
          <Pressable style={styles.toolbarBtn} onPress={onBack} accessibilityLabel="Back">
            <FontAwesome5 name="arrow-left" size={16} color={erp.text} />
          </Pressable>
        ) : null}
        <Text style={styles.toolbarTitle} numberOfLines={1}>
          {title || 'ERP'}
        </Text>
        <Pressable
          style={styles.toolbarBtn}
          onPress={() => void Linking.openURL(uri)}
          accessibilityLabel="Open in browser"
        >
          <FontAwesome5 name="external-link-alt" size={14} color={erp.textMuted} />
        </Pressable>
      </View>

      {error ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => { setError(''); setReloadNonce((n) => n + 1) }}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.webWrap}>
          <WebView
            key={`${uri}-${reloadNonce}`}
            ref={webRef}
            source={{ uri }}
            injectedJavaScriptBeforeContentLoaded={authScript}
            onLoadEnd={() => {
              setLoading(false)
              injectAuth()
            }}
            onError={() => setError('Could not load the ERP page. Check your connection and try again.')}
            onHttpError={() => setError('The ERP page returned an error. Try again or open in browser.')}
            onNavigationStateChange={(nav: WebViewNavigation) => {
              if (nav.loading) setLoading(true)
            }}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={erp.primary} />
              </View>
            )}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            domStorageEnabled
            javaScriptEnabled
            allowsBackForwardNavigationGestures
            setSupportMultipleWindows={false}
            style={styles.webview}
          />
          {loading ? (
            <View style={styles.loadingOverlay} pointerEvents="none">
              <ActivityIndicator size="large" color={erp.primary} />
            </View>
          ) : null}
        </View>
      )}
    </View>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: erp.bg },
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: erp.border,
      backgroundColor: erp.surface
    },
    toolbarBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: erp.radius.md
    },
    toolbarTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: erp.text },
    webWrap: { flex: 1 },
    webview: { flex: 1, backgroundColor: erp.bg },
    loadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: erp.bg
    },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
    errorText: { color: erp.danger, textAlign: 'center', lineHeight: 20 },
    retryBtn: {
      backgroundColor: erp.primary,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: erp.radius.md
    },
    retryText: { color: '#fff', fontWeight: '700' }
  })
}
