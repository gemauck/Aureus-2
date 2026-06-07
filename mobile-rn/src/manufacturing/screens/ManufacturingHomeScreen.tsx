import React from 'react'
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { AppHeader } from '../../components/shell/AppHeader'
import { ScreenBody } from '../../components/shell/ScreenBody'
import { API_BASE_URL } from '../../config'
import { useAuth } from '../../state/AuthContext'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'
import { navigateJobCards } from '../../navigation/navigationHelpers'
import { isAdmin } from '../../utils/menuAccess'
import { getManufacturingEntries, type ManufacturingEntry } from '../constants'
import type { ManufacturingStackParamList } from '../navigation'

type Props = NativeStackScreenProps<ManufacturingStackParamList, 'ManufacturingHome'>

export function ManufacturingHomeScreen({ navigation }: Props) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { user } = useAuth()
  const entries = getManufacturingEntries(isAdmin(user))

  const openEntry = (entry: ManufacturingEntry) => {
    if (entry.kind === 'native') {
      const parent = navigation.getParent()
      if (!parent) return
      if (entry.id === 'job-cards') {
        navigateJobCards(parent, undefined)
        return
      }
      if (entry.id === 'field-stock-take') {
        navigateJobCards(parent, { initialFlow: 'stock_take' })
      }
      return
    }
    if (!entry.webTab) return
    navigation.navigate('ManufacturingWeb', {
      tab: entry.webTab,
      title: entry.label
    })
  }

  return (
    <View style={styles.root}>
      <AppHeader
        title="Manufacturing"
        subtitle="Stock control and production"
        onNotificationsPress={() => navigation.getParent()?.navigate('Notifications')}
      />
      <ScreenBody padded={false}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>Operations hub</Text>
            <Text style={styles.heroSub}>
              Same tabs as the web ERP — inventory, orders, movements, and reports. Field job cards and
              stock take run natively with offline sync.
            </Text>
          </View>

          {entries.map((entry) => (
            <Pressable
              key={entry.id}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={() => openEntry(entry)}
            >
              <View style={[styles.iconWrap, entry.kind === 'native' ? styles.iconNative : styles.iconWeb]}>
                <FontAwesome5
                  name={entry.icon as never}
                  size={20}
                  color={entry.kind === 'native' ? erp.primary : erp.warning}
                />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.titleRow}>
                  <Text style={styles.cardTitle}>{entry.label}</Text>
                  {entry.adminOnly ? (
                    <View style={styles.adminBadge}>
                      <Text style={styles.adminBadgeText}>Admin</Text>
                    </View>
                  ) : null}
                  {entry.kind === 'native' ? (
                    <View style={styles.nativeBadge}>
                      <Text style={styles.nativeBadgeText}>Native</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.cardSub}>{entry.subtitle}</Text>
              </View>
              <FontAwesome5
                name={entry.kind === 'native' ? 'chevron-right' : 'layer-group'}
                size={14}
                color={erp.textSubtle}
              />
            </Pressable>
          ))}

          <Pressable
            style={styles.browserLink}
            onPress={() => void Linking.openURL(`${API_BASE_URL}/manufacturing`)}
          >
            <FontAwesome5 name="external-link-alt" size={13} color={erp.textMuted} />
            <Text style={styles.browserLinkText}>Open full module in browser</Text>
          </Pressable>
        </ScrollView>
      </ScreenBody>
    </View>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: erp.bg },
    scroll: { padding: erp.space.lg, gap: 10, paddingBottom: 32 },
    hero: { marginBottom: 6 },
    heroTitle: { fontSize: 22, fontWeight: '800', color: erp.text },
    heroSub: { fontSize: 14, color: erp.textMuted, marginTop: 6, lineHeight: 20 },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: erp.surface,
      borderRadius: erp.radius.lg,
      padding: 14,
      borderWidth: 1,
      borderColor: erp.border,
      ...erp.shadowSm
    },
    cardPressed: { opacity: 0.92 },
    iconWrap: {
      width: 46,
      height: 46,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center'
    },
    iconWeb: { backgroundColor: erp.warningSoft },
    iconNative: { backgroundColor: erp.primarySoft },
    titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
    cardTitle: { fontSize: 16, fontWeight: '800', color: erp.text },
    cardSub: { fontSize: 13, color: erp.textMuted, marginTop: 2, lineHeight: 18 },
    adminBadge: {
      backgroundColor: erp.dangerSoft,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6
    },
    adminBadgeText: { fontSize: 10, fontWeight: '800', color: erp.danger },
    nativeBadge: {
      backgroundColor: erp.primarySoft,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6
    },
    nativeBadgeText: { fontSize: 10, fontWeight: '800', color: erp.primary },
    browserLink: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 8,
      paddingVertical: 12
    },
    browserLinkText: { color: erp.textMuted, fontWeight: '600', fontSize: 14 }
  })
}
