import AsyncStorage from '@react-native-async-storage/async-storage'
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react'
import type { ErpTheme, JcTheme, ThemeMode } from './palettes'
import { resolveThemes } from './palettes'

const STORAGE_KEY = '@erp_mobile_theme_mode_v1'

type ThemeContextValue = {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
  erp: ErpTheme
  jc: JcTheme
  isDark: boolean
  ready: boolean
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('dark')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark') {
        setModeState(stored)
      }
      setReady(true)
    })
  }, [])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    void AsyncStorage.setItem(STORAGE_KEY, next)
  }, [])

  const { erp, jc, isDark } = useMemo(() => resolveThemes(mode), [mode])

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, setMode, erp, jc, isDark, ready }),
    [mode, setMode, erp, jc, isDark, ready]
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
