import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { AppHeader } from '../../components/shell/AppHeader'
import { ScreenBody } from '../../components/shell/ScreenBody'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'
import type { ToolsStackParamList } from '../navigation'

type Props = NativeStackScreenProps<ToolsStackParamList, 'ToolsHome'>

const TOOLS = [
  {
    id: 'expense-capture',
    title: 'Expense Capture',
    description: 'Snap receipts, AI extraction, allocate to accounts & cost centres, export CSV',
    icon: 'money-bill-wave' as const,
    color: '#059669',
    screen: 'ExpenseCapture' as const
  }
]

export function ToolsHomeScreen({ navigation }: Props) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)

  return (
    <View style={styles.root}>
      <AppHeader
        title="Staff Tools"
        subtitle="Capture expenses & utilities"
        onNotificationsPress={() => navigation.getParent()?.navigate('Notifications')}
      />
      <ScreenBody>
        <ScrollView contentContainerStyle={styles.list}>
          {TOOLS.map((tool) => (
            <Pressable
              key={tool.id}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={() => navigation.navigate(tool.screen)}
            >
              <View style={[styles.iconWrap, { backgroundColor: `${tool.color}22` }]}>
                <FontAwesome5 name={tool.icon} size={22} color={tool.color} />
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{tool.title}</Text>
                <Text style={styles.cardDesc}>{tool.description}</Text>
              </View>
              <FontAwesome5 name="chevron-right" size={14} color={erp.textSubtle} />
            </Pressable>
          ))}
        </ScrollView>
      </ScreenBody>
    </View>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: erp.bg },
    list: { gap: 12, paddingBottom: 24 },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      padding: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: erp.border,
      backgroundColor: erp.surface
    },
    cardPressed: { opacity: 0.85 },
    iconWrap: {
      width: 48,
      height: 48,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center'
    },
    cardBody: { flex: 1, gap: 4 },
    cardTitle: { fontSize: 16, fontWeight: '700', color: erp.text },
    cardDesc: { fontSize: 13, lineHeight: 18, color: erp.textMuted }
  })
}
