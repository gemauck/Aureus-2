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
import { jc } from '../theme'

export type SelectOption = { value: string; label: string }

type Props = {
  label?: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  hint?: string
}

export function SearchableSelect({
  label,
  value,
  options,
  onChange,
  placeholder = 'Search or select…',
  disabled,
  hint
}: Props) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')

  const selected = options.find((o) => o.value === value)
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const list = options.filter((o) => o.value)
    if (!q) return list
    return list.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, filter])

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        disabled={disabled}
        onPress={() => !disabled && setOpen(true)}
        style={({ pressed }) => [
          styles.trigger,
          disabled && styles.disabled,
          pressed && !disabled && styles.triggerPressed
        ]}
      >
        <Text style={selected ? styles.value : styles.placeholder} numberOfLines={1}>
          {selected?.label || placeholder}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={styles.backdropTap} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            {label ? <Text style={styles.sheetTitle}>{label}</Text> : null}
            <TextInput
              style={styles.search}
              placeholder="Type to filter…"
              placeholderTextColor={jc.textSubtle}
              value={filter}
              onChangeText={setFilter}
              autoFocus
              clearButtonMode="while-editing"
            />
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.value}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={20}
              maxToRenderPerBatch={24}
              windowSize={8}
              renderItem={({ item }) => {
                const isSelected = item.value === value
                return (
                  <Pressable
                    style={[styles.row, isSelected && styles.rowSelected]}
                    onPress={() => {
                      onChange(item.value)
                      setOpen(false)
                      setFilter('')
                    }}
                  >
                    <Text style={[styles.rowText, isSelected && styles.rowTextSelected]}>
                      {item.label}
                    </Text>
                    {isSelected ? <Text style={styles.check}>✓</Text> : null}
                  </Pressable>
                )
              }}
              ListEmptyComponent={<Text style={styles.empty}>No matches</Text>}
            />
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: jc.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: jc.border,
    borderRadius: jc.radius.md,
    paddingHorizontal: jc.space.md,
    paddingVertical: 14,
    backgroundColor: jc.surface
  },
  triggerPressed: { borderColor: jc.borderFocus, backgroundColor: jc.primarySoft },
  disabled: { opacity: 0.45 },
  value: { flex: 1, fontSize: 16, color: jc.text, fontWeight: '500' },
  placeholder: { flex: 1, fontSize: 16, color: jc.textSubtle },
  chevron: { color: jc.textMuted, fontSize: 14, marginLeft: 8 },
  hint: { fontSize: 12, color: jc.textSubtle, marginTop: 2 },
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  backdropTap: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.4)' },
  sheet: {
    backgroundColor: jc.surface,
    maxHeight: '78%',
    borderTopLeftRadius: jc.radius.xl,
    borderTopRightRadius: jc.radius.xl,
    paddingHorizontal: jc.space.lg,
    paddingBottom: jc.space.lg,
    paddingTop: jc.space.sm
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: jc.border,
    marginBottom: jc.space.md
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: jc.text, marginBottom: jc.space.sm },
  search: {
    borderWidth: 1,
    borderColor: jc.border,
    borderRadius: jc.radius.md,
    padding: 12,
    marginBottom: jc.space.sm,
    fontSize: 16,
    backgroundColor: jc.surfaceMuted
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: jc.border
  },
  rowSelected: { backgroundColor: jc.primarySoft },
  rowText: { flex: 1, fontSize: 16, color: jc.text },
  rowTextSelected: { color: jc.primaryDark, fontWeight: '600' },
  check: { color: jc.primary, fontWeight: '700', fontSize: 16 },
  empty: { padding: 24, color: jc.textMuted, textAlign: 'center' }
})
