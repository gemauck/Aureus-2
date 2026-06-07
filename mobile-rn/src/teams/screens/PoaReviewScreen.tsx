import React, { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
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

type Props = NativeStackScreenProps<TeamsStackParamList, 'PoaReview'>

export function PoaReviewScreen({ navigation }: Props) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { accessToken } = useAuth()
  const [processing, setProcessing] = useState(false)
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
      const data = (await teamsApi.processPoaExcel(accessToken, {
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      })) as { summary?: string; downloadUrl?: string; reportUrl?: string }
      setResult({
        summary: data.summary || 'Processing complete.',
        downloadUrl: data.downloadUrl || data.reportUrl
      })
    } catch (e) {
      Alert.alert('POA Review', e instanceof Error ? e.message : 'Processing failed')
    } finally {
      setProcessing(false)
    }
  }

  const openWeb = () => {
    void Linking.openURL(`${API_BASE_URL}/teams/data-analytics?tab=poa-review`)
  }

  return (
    <View style={styles.root}>
      <ModuleHeader title="POA Review" subtitle="Fuel transaction review" showBack onBack={() => navigation.goBack()} />
      <ScreenBody>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.desc}>
            Upload a fuel transactions Excel workbook for server-side POA strength analysis and audit reporting.
          </Text>
          <Pressable style={styles.primaryBtn} onPress={() => void pickAndProcess()} disabled={processing}>
            {processing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>Choose Excel file</Text>
            )}
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={openWeb}>
            <Text style={styles.secondaryText}>Open full tool on web</Text>
          </Pressable>
          {result ? (
            <View style={styles.result}>
              <Text style={styles.resultTitle}>Result</Text>
              <Text style={styles.resultBody}>{result.summary}</Text>
              {result.downloadUrl ? (
                <Pressable onPress={() => void Linking.openURL(result.downloadUrl!)}>
                  <Text style={styles.link}>Download report</Text>
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
    content: { padding: erp.space.md, gap: 12 },
    desc: { fontSize: 15, color: erp.textMuted, lineHeight: 22 },
    primaryBtn: {
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
