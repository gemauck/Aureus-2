import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuth } from '../../state/AuthContext'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'
import { teamsApi } from '../api'
import type { TeamsStackParamList } from '../navigation'
import type { TeamDocument, TeamWorkflow } from '../types'
import { formatRelative } from '../utils'

type HubItem =
  | { kind: 'document'; item: TeamDocument }
  | { kind: 'workflow'; item: TeamWorkflow }

type Props = {
  teamId: string
  search: string
  navigation: NativeStackNavigationProp<TeamsStackParamList, 'TeamDetail'>
}

export function ProcessFlowsTab({ teamId, search, navigation }: Props) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { accessToken } = useAuth()
  const [items, setItems] = useState<HubItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(
    async (silent = false) => {
      if (!accessToken) return
      if (!silent) setLoading(true)
      try {
        const [documents, workflows] = await Promise.all([
          teamsApi.listDocuments(accessToken, teamId),
          teamsApi.listWorkflows(accessToken, teamId)
        ])
        const merged: HubItem[] = [
          ...workflows.map((item) => ({ kind: 'workflow' as const, item })),
          ...documents.map((item) => ({ kind: 'document' as const, item }))
        ].sort(
          (a, b) =>
            new Date(b.item.updatedAt || b.item.createdAt || 0).getTime() -
            new Date(a.item.updatedAt || a.item.createdAt || 0).getTime()
        )
        setItems(merged)
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [accessToken, teamId]
  )

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(({ item }) => (item.title || '').toLowerCase().includes(q))
  }, [items, search])

  if (loading) return <ActivityIndicator style={styles.loader} color={erp.primary} />

  return (
    <FlatList
      data={filtered}
      keyExtractor={(row) => `${row.kind}-${row.item.id}`}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true) }} />
      }
      ListEmptyComponent={<Text style={styles.empty}>No process flows or documents yet.</Text>}
      renderItem={({ item: row }) => {
        const { item, kind } = row
        const icon = kind === 'workflow' ? 'project-diagram' : 'file-alt'
        const sub =
          kind === 'workflow'
            ? (item as TeamWorkflow).canvasKind === 'drawio'
              ? 'Draw.io diagram'
              : 'Process diagram'
            : (item as TeamDocument).category || 'Document'
        return (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => {
              if (kind === 'workflow') {
                navigation.navigate('ProcessWorkflow', {
                  teamId,
                  workflowId: item.id,
                  title: item.title
                })
              } else {
                navigation.navigate('ProcessDocument', {
                  teamId,
                  documentId: item.id,
                  title: item.title
                })
              }
            }}
          >
            <View style={[styles.iconWrap, kind === 'workflow' && styles.iconWorkflow]}>
              <FontAwesome5 name={icon} size={16} color={kind === 'workflow' ? erp.primary : erp.textMuted} />
            </View>
            <View style={styles.body}>
              <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.meta}>
                {sub} · {formatRelative(item.updatedAt || item.createdAt)}
              </Text>
            </View>
            <FontAwesome5 name="chevron-right" size={12} color={erp.textSubtle} />
          </Pressable>
        )
      }}
    />
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    loader: { marginTop: 24 },
    list: { paddingHorizontal: erp.space.md, paddingBottom: 24, gap: 8 },
    empty: { textAlign: 'center', color: erp.textMuted, marginTop: 24 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: erp.surface,
      borderRadius: erp.radius.lg,
      padding: 14,
      borderWidth: 1,
      borderColor: erp.border
    },
    rowPressed: { opacity: 0.9 },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: 10,
      backgroundColor: erp.bg,
      alignItems: 'center',
      justifyContent: 'center'
    },
    iconWorkflow: { backgroundColor: `${erp.primary}18` },
    body: { flex: 1, minWidth: 0 },
    title: { fontSize: 15, fontWeight: '600', color: erp.text },
    meta: { fontSize: 12, color: erp.textSubtle, marginTop: 2 }
  })
}
