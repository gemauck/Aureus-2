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
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'

type User = { id: string; name?: string; email?: string }

type Props = {
  visible: boolean
  users: User[]
  selectedIds: string[]
  onSave: (ids: string[]) => void
  onClose: () => void
}

export function ShareNoteModal({ visible, users, selectedIds, onSave, onClose }: Props) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string[]>(selectedIds)

  React.useEffect(() => {
    if (visible) setPicked(selectedIds)
  }, [visible, selectedIds])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) => `${u.name || ''} ${u.email || ''}`.toLowerCase().includes(q))
  }, [users, query])

  const toggle = (id: string) => {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Share note</Text>
          <TextInput
            style={styles.search}
            placeholder="Search team…"
            placeholderTextColor={erp.textSubtle}
            value={query}
            onChangeText={setQuery}
          />
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            style={styles.list}
            renderItem={({ item }) => {
              const active = picked.includes(item.id)
              return (
                <Pressable style={styles.row} onPress={() => toggle(item.id)}>
                  <FontAwesome5
                    name={active ? 'check-square' : 'square'}
                    size={18}
                    color={active ? erp.primary : erp.textSubtle}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.name || item.email || 'User'}</Text>
                    {item.email ? <Text style={styles.email}>{item.email}</Text> : null}
                  </View>
                </Pressable>
              )
            }}
          />
          <View style={styles.actions}>
            <Pressable style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={styles.saveBtn}
              onPress={() => {
                onSave(picked)
                onClose()
              }}
            >
              <Text style={styles.saveText}>Save sharing</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: erp.surface,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      padding: 20,
      maxHeight: '80%'
    },
    title: { fontSize: 18, fontWeight: '800', color: erp.text, marginBottom: 12 },
    search: {
      borderWidth: 1,
      borderColor: erp.border,
      borderRadius: erp.radius.md,
      padding: 12,
      marginBottom: 12,
      color: erp.text,
      backgroundColor: erp.bg
    },
    list: { maxHeight: 320 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
    name: { fontSize: 15, fontWeight: '700', color: erp.text },
    email: { fontSize: 12, color: erp.textMuted },
    actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
    cancelBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: erp.radius.md,
      borderWidth: 1,
      borderColor: erp.border,
      alignItems: 'center'
    },
    cancelText: { fontWeight: '700', color: erp.textMuted },
    saveBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: erp.radius.md,
      backgroundColor: erp.primary,
      alignItems: 'center'
    },
    saveText: { fontWeight: '800', color: '#fff' }
  })
}
