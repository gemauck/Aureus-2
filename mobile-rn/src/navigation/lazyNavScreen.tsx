import React from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useThemedStyles } from '../theme/useThemedStyles'
import type { ErpTheme } from '../theme/palettes'
import { useTheme } from '../theme/ThemeContext'

/** Defer a stack screen module until React Navigation mounts that route. */
export function lazyNavScreen<T extends React.ComponentType<unknown>>(
  loader: () => T
): () => T {
  let cached: T | null = null

  function LazyNavScreen(props: React.ComponentProps<T>) {
    const { erp } = useTheme()
    const styles = useThemedStyles(createLazyStyles)
    const [attempt, setAttempt] = React.useState(0)

    const loadResult = React.useMemo(() => {
      if (cached) return { Screen: cached, error: null as string | null }
      try {
        cached = loader()
        return { Screen: cached, error: null }
      } catch (e) {
        return {
          Screen: null,
          error: e instanceof Error ? e.message : 'Could not load screen'
        }
      }
    }, [attempt])

    if (loadResult.error) {
      return (
        <View style={styles.errorWrap}>
          <Text style={styles.errorTitle}>Could not open this screen</Text>
          <Text style={styles.errorMessage}>{loadResult.error}</Text>
          <Pressable
            style={styles.retryBtn}
            onPress={() => {
              cached = null
              setAttempt((n) => n + 1)
            }}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      )
    }

    if (!loadResult.Screen) {
      return (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={erp.primary} />
        </View>
      )
    }

    const Screen = loadResult.Screen
    return <Screen {...props} />
  }

  return () => LazyNavScreen as T
}

function createLazyStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: erp.bg },
    errorWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: erp.bg,
      padding: 24,
      gap: 12
    },
    errorTitle: { fontSize: 18, fontWeight: '800', color: erp.text, textAlign: 'center' },
    errorMessage: { fontSize: 14, color: erp.danger, textAlign: 'center', lineHeight: 20 },
    retryBtn: {
      marginTop: 8,
      backgroundColor: erp.primary,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: erp.radius.md
    },
    retryText: { color: '#fff', fontWeight: '700' }
  })
}
