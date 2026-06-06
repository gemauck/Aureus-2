import React from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { API_BASE_URL } from '../config'
import { AppHeader } from '../components/shell/AppHeader'
import { ScreenBody } from '../components/shell/ScreenBody'
import { SCREEN_TITLES } from '../navigation/menuItems'
import type { RootStackParamList } from '../navigation/types'
import { useThemedStyles } from '../theme/useThemedStyles'
import type { ErpTheme } from '../theme/palettes'
import { useTheme } from '../theme/ThemeContext'


export type PlaceholderConfig = {
  webPath: string
  description: string
  icon: string
}

type Props = NativeStackScreenProps<RootStackParamList, keyof RootStackParamList>

export function createPlaceholderScreen(config: PlaceholderConfig) {
  return function PlaceholderScreen({ navigation, route }: Props) {
    const styles = useThemedStyles(createStyles)
    const { erp } = useTheme()
    const title = SCREEN_TITLES[route.name as keyof RootStackParamList] || route.name
    const url = `${API_BASE_URL}${config.webPath}`

    return (
      <View style={styles.root}>
        <AppHeader title={title} />
        <ScreenBody>
          <View style={styles.card}>
            <View style={styles.iconCircle}>
              <FontAwesome5 name={config.icon as never} size={28} color={erp.primary} />
            </View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.desc}>{config.description}</Text>
            <Pressable style={styles.primaryBtn} onPress={() => void Linking.openURL(url)}>
              <FontAwesome5 name="external-link-alt" size={14} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.primaryBtnText}>Open in browser</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={() => navigation.navigate('Dashboard')}>
              <Text style={styles.secondaryBtnText}>Back to dashboard</Text>
            </Pressable>
          </View>
        </ScreenBody>
      </View>
    )
  }
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: erp.bg },
  card: {
    marginTop: 24,
    backgroundColor: erp.surface,
    borderRadius: erp.radius.xl,
    padding: erp.space.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: erp.border,
    ...erp.shadow
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: erp.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16
  },
  title: { fontSize: 22, fontWeight: '800', color: erp.text, marginBottom: 8 },
  desc: { fontSize: 15, color: erp.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: erp.primary,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: erp.radius.md,
    width: '100%',
    justifyContent: 'center'
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryBtn: { marginTop: 14, padding: 10 },
  secondaryBtnText: { color: erp.textMuted, fontWeight: '600' }
  })
}

/** @deprecated use createPlaceholderScreen */
export function ModulePlaceholderScreen(props: Props) {
  return createPlaceholderScreen({
    webPath: '/dashboard',
    description: 'Open this module on the web ERP.',
    icon: 'layer-group'
  })(props)
}
