import React, { useMemo, useState } from 'react'
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'

import type { ErpUser } from '../types'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'

type Props = {
  visible: boolean
  users: ErpUser[]
  selectedId?: string | null
  onSelect: (user: ErpUser | null) => void
  onClose: () => void
}

export function AssigneePickerModal({ visible, users, selectedId, onSelect, onClose }: Props) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) =>
      `${u.name || ''} ${u.email || ''}`.toLowerCase().includes(q)
    )
  }, [users, query])

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Assign to</Text>
          <TextInput
            style={styles.search}
            placeholder="Search team…"
            placeholderTextColor={erp.textSubtle}
            value={query}
            onChangeText={setQuery}
          />
          <Pressable
            style={styles.unassign}
            onPress={() => {
              onSelect(null)
              onClose()
            }}
          >
            <FontAwesome5 name="user-slash" size={14} color={erp.textMuted} />
            <Text style={styles.unassignText}>Unassigned</Text>
          </Pressable>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            style={{ maxHeight: 320 }}
            renderItem={({ item }) => {
              const active = item.id === selectedId
              return (
                <Pressable
                  style={[styles.row, active && styles.rowActive]}
                  onPress={() => {
                    onSelect(item)
                    onClose()
                  }}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{(item.name || item.email || '?').charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.name || item.email}</Text>
                    {item.email && item.name ? (
                      <Text style={styles.email}>{item.email}</Text>
                    ) : null}
                  </View>
                  {active ? <FontAwesome5 name="check" size={14} color={erp.primary} /> : null}
                </Pressable>
              )
            }}
          />
          <Pressable style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: erp.surface,
    borderTopLeftRadius: erp.radius.xl,
    borderTopRightRadius: erp.radius.xl,
    padding: erp.space.lg,
    paddingBottom: 32,
    maxHeight: '80%'
  },
  title: { fontSize: 18, fontWeight: '800', color: erp.text, marginBottom: 10 },
  search: {
    borderWidth: 1,
    borderColor: erp.border,
    borderRadius: erp.radius.md,
    padding: 12,
    backgroundColor: erp.bg,
    color: erp.text,
    marginBottom: 10
  },
  unassign: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: erp.border
  },
  unassignText: { fontSize: 15, fontWeight: '600', color: erp.textMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: erp.borderLight
  },
  rowActive: { backgroundColor: erp.primarySoft },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: erp.primarySoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarText: { fontWeight: '800', color: erp.primary },
  name: { fontSize: 15, fontWeight: '700', color: erp.text },
  email: { fontSize: 12, color: erp.textMuted },
  cancel: { marginTop: 12, alignItems: 'center', paddingVertical: 12 },
  cancelText: { fontWeight: '700', color: erp.textMuted }
  })
}