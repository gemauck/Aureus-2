import React, { useEffect, useState } from 'react'
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'
import { recheckApkVersion } from '../services/apkVersionCheck'
import {
  getRequiredApkUpdate,
  subscribeApkVersionState,
  type ApkVersionCheckState,
  type RequiredApkUpdate
} from '../services/apkUpdateUi'
import { useThemedStyles } from '../theme/useThemedStyles'
import type { ErpTheme } from '../theme/palettes'
import { useTheme } from '../theme/ThemeContext'

export function ApkUpdateGate() {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const [checkState, setCheckState] = useState<ApkVersionCheckState>('unknown')
  const [required, setRequired] = useState<RequiredApkUpdate | null>(() => getRequiredApkUpdate())
  const [rechecking, setRechecking] = useState(false)

  useEffect(
    () =>
      subscribeApkVersionState((state, info) => {
        setCheckState(state)
        setRequired(info)
      }),
    []
  )

  const visible = checkState === 'required' && required !== null
  if (!visible || !required) return null

  const versionLabel = required.versionName || `build ${required.versionCode}`

  async function onDownload() {
    try {
      await Linking.openURL(required!.apkUrl)
    } catch {
      // Gate stays open; user can copy from Settings if needed.
    }
  }

  async function onRecheck() {
    setRechecking(true)
    try {
      await recheckApkVersion()
    } finally {
      setRechecking(false)
    }
  }

  return (
    <Modal visible animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <FontAwesome5 name="android" size={28} color={erp.primary} />
          </View>
          <Text style={styles.title}>App update required</Text>
          <Text style={styles.message}>
            {required.releaseNotes ||
              `Version ${versionLabel} is available. You must install the latest APK (you have build ${required.installedVersionCode}) before you can use the app.`}
          </Text>
          <Text style={styles.steps}>
            Tap Download, install the APK when prompted, then return here and tap Check again.
          </Text>
          <Pressable style={styles.primaryBtn} onPress={() => void onDownload()}>
            <FontAwesome5 name="download" size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>Download latest APK</Text>
          </Pressable>
          <Pressable
            style={[styles.secondaryBtn, rechecking && styles.secondaryBtnDisabled]}
            disabled={rechecking}
            onPress={() => void onRecheck()}
          >
            <Text style={styles.secondaryBtnText}>{rechecking ? 'Checking…' : 'Check again'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: erp.bg,
      padding: 24
    },
    card: {
      width: '100%',
      maxWidth: 360,
      alignItems: 'stretch',
      gap: 14,
      borderRadius: erp.radius.lg,
      backgroundColor: erp.surface,
      borderWidth: 1,
      borderColor: erp.border,
      paddingHorizontal: 24,
      paddingVertical: 28
    },
    iconWrap: {
      alignSelf: 'center',
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: erp.primarySoft
    },
    title: {
      color: erp.text,
      fontSize: 20,
      fontWeight: '800',
      textAlign: 'center'
    },
    message: {
      color: erp.text,
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center'
    },
    steps: {
      color: erp.textMuted,
      fontSize: 13,
      lineHeight: 19,
      textAlign: 'center'
    },
    primaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      marginTop: 4,
      backgroundColor: erp.primary,
      borderRadius: erp.radius.md,
      paddingVertical: 14,
      paddingHorizontal: 16
    },
    primaryBtnText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700'
    },
    secondaryBtn: {
      alignItems: 'center',
      paddingVertical: 12
    },
    secondaryBtnDisabled: {
      opacity: 0.6
    },
    secondaryBtnText: {
      color: erp.primary,
      fontSize: 15,
      fontWeight: '700'
    }
  })
}
