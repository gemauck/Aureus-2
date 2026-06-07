import React from 'react'
import { StyleSheet, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { AccessDeniedScreen } from '../components/AccessDeniedScreen'
import { ErpModuleWebView } from '../components/ErpModuleWebView'
import { SCREEN_TITLES } from '../navigation/menuItems'
import type { RootStackParamList } from '../navigation/types'
import { useAuth } from '../state/AuthContext'
import { useThemedStyles } from '../theme/useThemedStyles'
import type { ErpTheme } from '../theme/palettes'
import { canAccessScreen } from '../utils/screenAccess'

export type WebModuleConfig = {
  webPath: string
  title?: string
  permission?: string | null
  screen?: keyof RootStackParamList
}

type Props = NativeStackScreenProps<RootStackParamList, keyof RootStackParamList>

export function createWebModuleScreen(config: WebModuleConfig) {
  return function WebModuleScreen({ navigation, route }: Props) {
    const styles = useThemedStyles(createStyles)
    const { user } = useAuth()
    const screenName = (config.screen || route.name) as keyof RootStackParamList
    const title = config.title || SCREEN_TITLES[screenName] || screenName

    if (!canAccessScreen(user, screenName)) {
      return (
        <AccessDeniedScreen
          title={title}
          onBack={() => {
            if (navigation.canGoBack()) navigation.goBack()
            else navigation.navigate('Dashboard')
          }}
        />
      )
    }

    return (
      <View style={styles.root}>
        <ErpModuleWebView
          webPath={config.webPath}
          title={title}
          onBack={() => {
            if (navigation.canGoBack()) navigation.goBack()
            else navigation.navigate('Dashboard')
          }}
        />
      </View>
    )
  }
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: erp.bg }
  })
}
