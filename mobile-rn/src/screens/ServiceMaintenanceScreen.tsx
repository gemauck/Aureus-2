import React from 'react'
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { AppHeader } from '../components/shell/AppHeader'
import { ScreenBody } from '../components/shell/ScreenBody'

import type { RootStackParamList } from '../navigation/types'
import { API_BASE_URL } from '../config'
import { useThemedStyles } from '../theme/useThemedStyles'
import type { ErpTheme } from '../theme/palettes'
import { useTheme } from '../theme/ThemeContext'

type Props = NativeStackScreenProps<RootStackParamList, 'ServiceMaintenance'>

export function ServiceMaintenanceScreen({ navigation }: Props) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  return (
    <View style={styles.root}>
      <AppHeader title="Service & Maintenance" subtitle="Field service tools" />
      <ScreenBody padded={false}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>Field service</Text>
            <Text style={styles.heroSub}>
              Native job cards with offline sync, stock capture, photos, and customer sign-off.
            </Text>
          </View>

          <Pressable style={styles.featureCard} onPress={() => navigation.navigate('JobCards')}>
            <View style={[styles.featureIcon, { backgroundColor: erp.primarySoft }]}>
              <FontAwesome5 name="clipboard-list" size={22} color={erp.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.featureTitle}>Job cards</Text>
              <Text style={styles.featureSub}>New visit wizard, prior list, stock-take</Text>
            </View>
            <FontAwesome5 name="chevron-right" size={14} color={erp.textSubtle} />
          </Pressable>

          <Pressable
            style={styles.featureCard}
            onPress={() => navigation.navigate('JobCards', { initialFlow: 'incident_form' })}
          >
            <View style={[styles.featureIcon, { backgroundColor: erp.warningSoft }]}>
              <FontAwesome5 name="exclamation-triangle" size={22} color={erp.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.featureTitle}>Report incident</Text>
              <Text style={styles.featureSub}>Record a site incident in the field</Text>
            </View>
            <FontAwesome5 name="chevron-right" size={14} color={erp.textSubtle} />
          </Pressable>

          <Pressable
            style={styles.featureCard}
            onPress={() => navigation.navigate('JobCards', { initialFlow: 'incident_list' })}
          >
            <View style={[styles.featureIcon, { backgroundColor: '#fef3c7' }]}>
              <FontAwesome5 name="file-alt" size={22} color="#b45309" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.featureTitle}>Incident reports</Text>
              <Text style={styles.featureSub}>View and edit your submitted incidents</Text>
            </View>
            <FontAwesome5 name="chevron-right" size={14} color={erp.textSubtle} />
          </Pressable>

          <Pressable
            style={styles.featureCard}
            onPress={() => void Linking.openURL(`${API_BASE_URL}/service-maintenance`)}
          >
            <View style={[styles.featureIcon, { backgroundColor: erp.warningSoft }]}>
              <FontAwesome5 name="wrench" size={22} color={erp.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.featureTitle}>Service module (web)</Text>
              <Text style={styles.featureSub}>Schedules, assets, full history</Text>
            </View>
            <FontAwesome5 name="external-link-alt" size={14} color={erp.textSubtle} />
          </Pressable>
        </ScrollView>
      </ScreenBody>
    </View>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: erp.bg },
  scroll: { padding: erp.space.lg, gap: 12 },
  hero: { marginBottom: 8 },
  heroTitle: { fontSize: 24, fontWeight: '800', color: erp.text },
  heroSub: { fontSize: 14, color: erp.textMuted, marginTop: 6, lineHeight: 20 },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: erp.surface,
    borderRadius: erp.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: erp.border,
    ...erp.shadowSm
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  featureTitle: { fontSize: 16, fontWeight: '800', color: erp.text },
  featureSub: { fontSize: 13, color: erp.textMuted, marginTop: 2 }
  })
}