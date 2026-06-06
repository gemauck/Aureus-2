import AsyncStorage from '@react-native-async-storage/async-storage'
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react'
import { Appearance } from 'react-native'
import type { ErpTheme, JcTheme, ThemeMode, ThemePreference } from './palettes'
import { resolveColorScheme, resolveThemes } from './palettes'

const STORAGE_KEY = '@erp_mobile_theme_mode_v1'

function readSystemScheme(): ThemeMode {
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light'
}

function parseStoredPreference(stored: string | null): ThemePreference {
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored
  }
  return 'system'
}

type ThemeContextValue = {
  /** Resolved light/dark palette in use. */
  mode: ThemeMode
  /** User setting: system, light, or dark. */
  preference: ThemePreference
  setPreference: (preference: ThemePreference) => void
  erp: ErpTheme
  jc: JcTheme
  isDark: boolean
  ready: boolean
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system')
  const [systemScheme, setSystemScheme] = useState<ThemeMode>(readSystemScheme)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      setPreferenceState(parseStoredPreference(stored))
      setReady(true)
    })
  }, [])

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme === 'dark' ? 'dark' : 'light')
    })
    return () => sub.remove()
  }, [])

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
    void AsyncStorage.setItem(STORAGE_KEY, next)
  }, [])

  const mode = useMemo(
    () => resolveColorScheme(preference, systemScheme),
    [preference, systemScheme]
  )

  const { erp, jc, isDark } = useMemo(() => resolveThemes(mode), [mode])

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, preference, setPreference, erp, jc, isDark, ready }),
    [mode, preference, setPreference, erp, jc, isDark, ready]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}
