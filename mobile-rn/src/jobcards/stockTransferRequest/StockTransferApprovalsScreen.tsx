import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../../state/AuthContext'
import { useNetwork } from '../../hooks/useNetwork'
import { jobcardsApi } from '../api'
import { useJobCardWizard } from '../WizardContext'
import { OfflineBanner } from '../../components/OfflineBanner'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { JcTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'

type TransferRequest = {
  id: string
  requestRef?: string
  fromLocationName?: string
  toLocationName?: string
  requestedBy?: string
  status?: string
  notes?: string
  lines?: Array<{ sku: string; itemName: string; quantity: number }>
}

type Props = {
  initialRequestId?: string
}

export function StockTransferApprovalsScreen({ initialRequestId }: Props) {
  const styles = useThemedStyles(createStyles)
  const { jc } = useTheme()
  const { accessToken } = useAuth()
  const { isOnline } = useNetwork()
  const { setWizardFlow } = useJobCardWizard()
  const [requests, setRequests] = useState<TransferRequest[]>([])
  const [selected, setSelected] = useState<TransferRequest | null>(null)
  const [reviewNotes, setReviewNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)

  const load = useCallback(async () => {
    if (!accessToken) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await jobcardsApi.listStockTransferRequests(accessToken, { pendingMyApproval: true })
      const list = (res?.requests || res?.data?.requests || []) as TransferRequest[]
      setRequests(list)
      if (initialRequestId) {
        const match = list.find((r) => r.id === initialRequestId)
        if (match) setSelected(match)
        else {
          const detail = await jobcardsApi.getStockTransferRequest(accessToken, initialRequestId)
          const req = (detail?.request || detail?.data?.request) as TransferRequest | undefined
          if (req) {
            setSelected(req)
            if (!list.some((r) => r.id === req.id)) setRequests((prev) => [req, ...prev])
          }
        }
      }
    } catch {
      setRequests([])
    } finally {
      setLoading(false)
    }
  }, [accessToken, initialRequestId])

  useEffect(() => {
    void load()
  }, [load])

  const act = async (action: 'approve' | 'reject') => {
    if (!selected?.id || !accessToken) return
    const verb = action === 'approve' ? 'Approve and move stock?' : 'Reject this request?'
    Alert.alert(action === 'approve' ? 'Approve' : 'Reject', verb, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: action === 'approve' ? 'Approve' : 'Reject',
        style: action === 'approve' ? 'default' : 'destructive',
        onPress: () => {
          void (async () => {
            setActing(true)
            try {
              if (action === 'approve') {
                await jobcardsApi.approveStockTransferRequest(accessToken, selected.id, reviewNotes)
              } else {
                await jobcardsApi.rejectStockTransferRequest(accessToken, selected.id, reviewNotes)
              }
              setReviewNotes('')
              setSelected(null)
              await load()
              Alert.alert('Done', action === 'approve' ? 'Stock moved.' : 'Request rejected.')
            } catch (e) {
              Alert.alert('Failed', e instanceof Error ? e.message : 'Action failed')
            } finally {
              setActing(false)
            }
          })()
        }
      }
    ])
  }

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <OfflineBanner visible={!isOnline} />
      <View style={styles.header}>
        <Pressable onPress={() => setWizardFlow('landing')} hitSlop={8}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Transfer approvals</Text>
        <Text style={styles.subtitle}>Review requests for stock leaving your location.</Text>
      </View>
      {loading ? (
        <ActivityIndicator color={jc.primary} style={{ marginTop: 24 }} />
      ) : selected ? (
        <View style={styles.detail}>
          <Text style={styles.ref}>{selected.requestRef}</Text>
          <Text style={styles.route}>
            {selected.fromLocationName} → {selected.toLocationName}
          </Text>
          <Text style={styles.meta}>By {selected.requestedBy || 'Unknown'}</Text>
          {(selected.lines || []).map((line) => (
            <Text key={line.sku} style={styles.line}>
              {line.sku} — {line.itemName} × {line.quantity}
            </Text>
          ))}
          <TextInput
            style={styles.input}
            value={reviewNotes}
            onChangeText={setReviewNotes}
            placeholder="Review notes (optional)"
            multiline
          />
          <View style={styles.actions}>
            <Pressable
              style={[styles.approveBtn, acting && styles.disabled]}
              disabled={acting}
              onPress={() => void act('approve')}
            >
              <Text style={styles.approveText}>Approve</Text>
            </Pressable>
            <Pressable
              style={[styles.rejectBtn, acting && styles.disabled]}
              disabled={acting}
              onPress={() => void act('reject')}
            >
              <Text style={styles.rejectText}>Reject</Text>
            </Pressable>
          </View>
          <Pressable onPress={() => setSelected(null)}>
            <Text style={styles.backList}>← Back to list</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No pending approvals.</Text>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => setSelected(item)}>
              <Text style={styles.cardRef}>{item.requestRef}</Text>
              <Text style={styles.cardRoute}>
                {item.fromLocationName} → {item.toLocationName}
              </Text>
              <Text style={styles.cardMeta}>{item.requestedBy}</Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  )
}

function createStyles(jc: JcTheme) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: jc.bgGradientMid },
    header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
    back: { color: jc.primary, fontSize: 16, marginBottom: 8 },
    title: { fontSize: 22, fontWeight: '700', color: jc.text },
    subtitle: { fontSize: 14, color: jc.textMuted, marginTop: 4 },
    list: { padding: 16, gap: 10 },
    empty: { textAlign: 'center', color: jc.textMuted, padding: 24 },
    card: {
      backgroundColor: jc.surface,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: jc.border,
      marginBottom: 10
    },
    cardRef: { fontWeight: '700', color: jc.text },
    cardRoute: { color: jc.text, marginTop: 4 },
    cardMeta: { color: jc.textMuted, fontSize: 12, marginTop: 4 },
    detail: { padding: 16, gap: 8 },
    ref: { fontWeight: '700', fontSize: 16, color: jc.text },
    route: { fontSize: 15, color: jc.text },
    meta: { color: jc.textMuted, fontSize: 13 },
    line: { fontSize: 14, color: jc.text },
    input: {
      borderWidth: 1,
      borderColor: jc.border,
      borderRadius: 10,
      padding: 10,
      marginTop: 8,
      color: jc.text,
      backgroundColor: jc.surface
    },
    actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
    approveBtn: {
      flex: 1,
      backgroundColor: jc.success || '#16a34a',
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center'
    },
    approveText: { color: '#fff', fontWeight: '700' },
    rejectBtn: {
      flex: 1,
      backgroundColor: jc.danger,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center'
    },
    rejectText: { color: '#fff', fontWeight: '700' },
    disabled: { opacity: 0.6 },
    backList: { color: jc.primary, marginTop: 16, textAlign: 'center' }
  })
}
