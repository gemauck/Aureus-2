import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { WebView } from 'react-native-webview'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { apiUrl } from '../../config'
import { ModuleHeader } from '../../components/shell/ModuleHeader'
import { ScreenBody } from '../../components/shell/ScreenBody'
import { useAuth } from '../../state/AuthContext'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'
import { teamsApi } from '../api'
import type { TeamsStackParamList } from '../navigation'
import type { DiscussionAttachment, TeamDocument } from '../types'
import { parseJsonField, stripHtml } from '../utils'

type Props = NativeStackScreenProps<TeamsStackParamList, 'ProcessDocument'>

function resolveUrl(url?: string) {
  if (!url) return ''
  if (url.startsWith('http') || url.startsWith('file:')) return url
  return apiUrl(url.startsWith('/') ? url : `/${url}`)
}

export function ProcessDocumentScreen({ navigation, route }: Props) {
  const { documentId, title } = route.params
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { accessToken } = useAuth()
  const [doc, setDoc] = useState<TeamDocument | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!accessToken) return
    void (async () => {
      try {
        setDoc(await teamsApi.getDocument(accessToken, documentId))
      } finally {
        setLoading(false)
      }
    })()
  }, [accessToken, documentId])

  const attachments = parseJsonField<DiscussionAttachment[]>(doc?.attachments, [])
  const content = doc?.content || ''
  const isHtml = /<[a-z][\s\S]*>/i.test(content)

  return (
    <View style={styles.root}>
      <ModuleHeader title={doc?.title || title || 'Document'} showBack onBack={() => navigation.goBack()} />
      <ScreenBody>
        {loading ? (
          <ActivityIndicator color={erp.primary} />
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            {doc?.category ? <Text style={styles.meta}>{doc.category}</Text> : null}
            {isHtml ? (
              <WebView
                originWhitelist={['*']}
                source={{ html: wrapHtml(content, erp) }}
                style={styles.webview}
              />
            ) : content ? (
              <Text style={styles.body}>{stripHtml(content)}</Text>
            ) : (
              <Text style={styles.empty}>No text content.</Text>
            )}
            {attachments.length ? (
              <View style={styles.attachSection}>
                <Text style={styles.attachTitle}>Attachments</Text>
                {attachments.map((a, i) => (
                  <Pressable key={`${a.url}-${i}`} onPress={() => void Linking.openURL(resolveUrl(a.url))}>
                    <Text style={styles.attachLink}>{a.name || 'Attachment'}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </ScrollView>
        )}
      </ScreenBody>
    </View>
  )
}

function wrapHtml(body: string, erp: ErpTheme) {
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>body{font-family:-apple-system,sans-serif;font-size:15px;line-height:1.5;color:${erp.text};margin:12px;}</style></head>
<body>${body}</body></html>`
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: erp.bg },
    content: { padding: erp.space.md, paddingBottom: 40 },
    meta: { fontSize: 13, color: erp.textSubtle, marginBottom: 12 },
    body: { fontSize: 15, color: erp.text, lineHeight: 22 },
    empty: { color: erp.textMuted },
    webview: { minHeight: 300, backgroundColor: 'transparent' },
    attachSection: { marginTop: 20 },
    attachTitle: { fontSize: 15, fontWeight: '700', color: erp.text, marginBottom: 8 },
    attachLink: { fontSize: 14, color: erp.primary, paddingVertical: 6 }
  })
}
