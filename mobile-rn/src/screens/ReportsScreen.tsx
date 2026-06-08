import React from 'react'
import { StyleSheet, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { AccessDeniedScreen } from '../components/AccessDeniedScreen'
import { ErpModuleWebView } from '../components/ErpModuleWebView'
import { SCREEN_TITLES } from '../navigation/menuItems'
import type { RootStackParamList } from '../navigation/types'
import { reportsWebPath } from '../reports/constants'
import { useAuth } from '../state/AuthContext'
import { useThemedStyles } from '../theme/useThemedStyles'
import type { ErpTheme } from '../theme/palettes'
import { canAccessScreen } from '../utils/screenAccess'

type Props = NativeStackScreenProps<RootStackParamList, 'Reports'>

export function ReportsScreen({ navigation, route }: Props) {
  const styles = useThemedStyles(createStyles)
  const { user } = useAuth()
  const title = SCREEN_TITLES.Reports

  if (!canAccessScreen(user, 'Reports')) {
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

  const { tab, highlightFeedbackId } = route.params || {}

  return (
    <View style={styles.root}>
      <ErpModuleWebView
        webPath={reportsWebPath({ tab, highlightFeedbackId })}
        title={title}
        onBack={() => {
          if (navigation.canGoBack()) navigation.goBack()
          else navigation.navigate('Dashboard')
        }}
      />
    </View>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: erp.bg }
  })
}
