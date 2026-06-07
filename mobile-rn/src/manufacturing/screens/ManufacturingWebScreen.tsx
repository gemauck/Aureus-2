import React from 'react'
import { View, StyleSheet } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { ErpModuleWebView } from '../../components/ErpModuleWebView'
import { manufacturingWebPath } from '../constants'
import type { ManufacturingStackParamList } from '../navigation'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'

type Props = NativeStackScreenProps<ManufacturingStackParamList, 'ManufacturingWeb'>

export function ManufacturingWebScreen({ navigation, route }: Props) {
  const styles = useThemedStyles(createStyles)
  const { tab, title, query } = route.params

  return (
    <View style={styles.root}>
      <ErpModuleWebView
        webPath={manufacturingWebPath(tab, query)}
        title={title}
        onBack={() => navigation.goBack()}
      />
    </View>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: erp.bg }
  })
}
