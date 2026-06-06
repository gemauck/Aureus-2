import React, { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'

export type QuickAddField = {
  key: string
  label: string
  placeholder?: string
  required?: boolean
  multiline?: boolean
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'numeric'
}

type Props = {
  label: string
  fields: QuickAddField[]
  onSubmit: (values: Record<string, string>) => Promise<void>
  busy?: boolean
}

export function CrmQuickAdd({ label, fields, onSubmit, busy }: Props) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})

  const reset = () => {
    setValues({})
    setOpen(false)
  }

  const submit = async () => {
    for (const f of fields) {
      if (f.required && !values[f.key]?.trim()) return
    }
    await onSubmit(
      Object.fromEntries(fields.map((f) => [f.key, (values[f.key] || '').trim()]))
    )
    reset()
  }

  if (!open) {
    return (
      <Pressable style={styles.addBtn} onPress={() => setOpen(true)} disabled={busy}>
        <FontAwesome5 name="plus" size={12} color={erp.primary} style={{ marginRight: 8 }} />
        <Text style={styles.addBtnText}>{label}</Text>
      </Pressable>
    )
  }

  return (
    <View style={styles.formCard}>
      <Text style={styles.formTitle}>{label}</Text>
      {fields.map((f) => (
        <View key={f.key} style={styles.field}>
          <Text style={styles.fieldLabel}>
            {f.label}
            {f.required ? ' *' : ''}
          </Text>
          <TextInput
            style={[styles.input, f.multiline && styles.inputMulti]}
            value={values[f.key] || ''}
            onChangeText={(t) => setValues((prev) => ({ ...prev, [f.key]: t }))}
            placeholder={f.placeholder || f.label}
            placeholderTextColor={erp.textSubtle}
            keyboardType={f.keyboardType || 'default'}
            multiline={f.multiline}
            textAlignVertical={f.multiline ? 'top' : 'center'}
          />
        </View>
      ))}
      <View style={styles.actions}>
        <Pressable style={styles.cancelBtn} onPress={reset} disabled={busy}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable style={[styles.saveBtn, busy && styles.saveBtnBusy]} onPress={() => void submit()} disabled={busy}>
          {busy ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.saveText}>Save</Text>
          )}
        </Pressable>
      </View>
    </View>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 11,
      borderRadius: erp.radius.md,
      borderWidth: 1,
      borderColor: erp.primary,
      borderStyle: 'dashed',
      backgroundColor: erp.primarySoft,
      marginBottom: 10
    },
    addBtnText: { fontSize: 14, fontWeight: '700', color: erp.primary },
    formCard: {
      backgroundColor: erp.surface,
      borderRadius: erp.radius.lg,
      borderWidth: 1,
      borderColor: erp.border,
      padding: 14,
      marginBottom: 10,
      ...erp.shadowSm
    },
    formTitle: { fontSize: 15, fontWeight: '800', color: erp.text, marginBottom: 10 },
    field: { marginBottom: 10 },
    fieldLabel: { fontSize: 12, fontWeight: '600', color: erp.textMuted, marginBottom: 4 },
    input: {
      borderWidth: 1,
      borderColor: erp.border,
      borderRadius: erp.radius.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: erp.text,
      backgroundColor: erp.surfaceMuted
    },
    inputMulti: { minHeight: 72 },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
    cancelBtn: { paddingVertical: 10, paddingHorizontal: 14, marginRight: 10 },
    cancelText: { fontWeight: '700', color: erp.textMuted },
    saveBtn: {
      backgroundColor: erp.primary,
      paddingVertical: 10,
      paddingHorizontal: 18,
      borderRadius: erp.radius.md,
      minWidth: 80,
      alignItems: 'center'
    },
    saveBtnBusy: { opacity: 0.7 },
    saveText: { color: '#fff', fontWeight: '800' }
  })
}
