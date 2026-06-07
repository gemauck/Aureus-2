import React, { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View
} from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { API_BASE_URL } from '../../config'
import { ModuleHeader } from '../../components/shell/ModuleHeader'
import { ScreenBody } from '../../components/shell/ScreenBody'
import { useAuth } from '../../state/AuthContext'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'
import { teamsApi } from '../api'
import type { TeamsStackParamList } from '../navigation'

type Props = NativeStackScreenProps<TeamsStackParamList, 'DfrrCheck'>

const CHECKS = [
  { key: 'requirePumpReadings', label: 'Pump readings' },
  { key: 'requireTankReadings', label: 'Tank readings' },
  { key: 'requireConsumptionAssessment', label: 'Consumption assessment' },
  { key: 'requireRefundRateCheck', label: 'Refund rate check' },
  { key: 'requireOperatorCheck', label: 'Operator check' },
  { key: 'requireLocationCheck', label: 'Location check' }
] as const

export function DfrrCheckScreen({ navigation }: Props) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { accessToken } = useAuth()
  const [processing, setProcessing] = useState(false)
  const [checks, setChecks] = useState<Record<string, boolean>>({
    requirePumpReadings: true,
    requireTankReadings: true,
    requireConsumptionAssessment: true,
    requireRefundRateCheck: true,
    requireOperatorCheck: false,
    requireLocationCheck: false
  })
  const [result, setResult] = useState<{ summary?: string; downloadUrl?: string } | null>(null)

  const pickAndProcess = async () => {
    if (!accessToken || processing) return
    const picked = await DocumentPicker.getDocumentAsync({
      type: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel'
      ],
      copyToCacheDirectory: true
    })
    if (picked.canceled || !picked.assets?.[0]) return
    const asset = picked.assets[0]
    setProcessing(true)
    setResult(null)
    try {
      const data = (await teamsApi.processDfrrWorkbook(
        accessToken,
        {
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        },
        checks
      )) as { summary?: string; downloadUrl?: string; reportUrl?: string; message?: string }
      setResult({
        summary: data.summary || data.message || 'Audit complete.',
        downloadUrl: data.downloadUrl || data.reportUrl
      })
    } catch (e) {
      Alert.alert('DFRR Check', e instanceof Error ? e.message : 'Processing failed')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <View style={styles.root}>
      <ModuleHeader title="DFRR Check" subtitle="Fuel refund report audit" showBack onBack={() => navigation.goBack()} />
      <ScreenBody>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.desc}>
            Upload a Detailed Fuel Refund Report workbook to run configurable audit checks.
          </Text>
          {CHECKS.map((c) => (
            <View key={c.key} style={styles.checkRow}>
              <Text style={styles.checkLabel}>{c.label}</Text>
              <Switch
                value={!!checks[c.key]}
                onValueChange={(v) => setChecks((p) => ({ ...p, [c.key]: v }))}
              />
            </View>
          ))}
          <Pressable style={styles.primaryBtn} onPress={() => void pickAndProcess()} disabled={processing}>
            {processing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>Choose Excel workbook</Text>
            )}
          </Pressable>
          <Pressable
            style={styles.secondaryBtn}
            onPress={() => void Linking.openURL(`${API_BASE_URL}/teams/data-analytics?tab=dfrr-check`)}
          >
            <Text style={styles.secondaryText}>Open full tool on web</Text>
          </Pressable>
          {result ? (
            <View style={styles.result}>
              <Text style={styles.resultTitle}>Result</Text>
              <Text style={styles.resultBody}>{result.summary}</Text>
              {result.downloadUrl ? (
                <Pressable onPress={() => void Linking.openURL(result.downloadUrl!)}>
                  <Text style={styles.link}>Download annotated workbook</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      </ScreenBody>
    </View>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: erp.bg },
    content: { padding: erp.space.md, gap: 10, paddingBottom: 40 },
    desc: { fontSize: 15, color: erp.textMuted, lineHeight: 22, marginBottom: 8 },
    checkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: erp.border
    },
    checkLabel: { fontSize: 15, color: erp.text },
    primaryBtn: {
      marginTop: 12,
      backgroundColor: erp.primary,
      paddingVertical: 14,
      borderRadius: erp.radius.md,
      alignItems: 'center'
    },
    primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    secondaryBtn: {
      borderWidth: 1,
      borderColor: erp.border,
      paddingVertical: 12,
      borderRadius: erp.radius.md,
      alignItems: 'center',
      backgroundColor: erp.surface
    },
    secondaryText: { color: erp.primary, fontWeight: '600' },
    result: {
      marginTop: 16,
      padding: 14,
      backgroundColor: erp.surface,
      borderRadius: erp.radius.lg,
      borderWidth: 1,
      borderColor: erp.border
    },
    resultTitle: { fontSize: 16, fontWeight: '700', color: erp.text, marginBottom: 8 },
    resultBody: { fontSize: 14, color: erp.textMuted, lineHeight: 20 },
    link: { marginTop: 10, color: erp.primary, fontWeight: '600' }
  })
}
