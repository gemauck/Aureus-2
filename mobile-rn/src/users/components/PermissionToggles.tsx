import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { PERMISSION_CATEGORIES } from '../constants'
import { isAdminRole } from '../utils'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'

type Props = {
  role: string
  customPermissions: string[]
  onChange: (permissions: string[]) => void
}

function allPermissionKeys() {
  return Object.values(PERMISSION_CATEGORIES).flatMap((cat) => [
    cat.permission,
    ...(cat.subcategories?.map((s) => s.permission) || [])
  ])
}

export function PermissionToggles({ role, customPermissions, onChange }: Props) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)

  const toggle = (permissionKey: string) => {
    const all = allPermissionKeys()
    let current = customPermissions
    if (current.length === 0) {
      const admin = isAdminRole(role)
      current = all.filter((perm) => {
        const category = Object.values(PERMISSION_CATEGORIES).find((c) => c.permission === perm)
        const sub = Object.values(PERMISSION_CATEGORIES)
          .flatMap((c) => c.subcategories || [])
          .find((s) => s.permission === perm)
        const adminOnly = category?.adminOnly || false
        return !adminOnly || admin
      })
    }
    const next = current.includes(permissionKey)
      ? current.filter((p) => p !== permissionKey)
      : [...current, permissionKey]
    onChange(next)
  }

  const isEnabled = (permissionKey: string, adminOnly?: boolean) => {
    if (adminOnly && !isAdminRole(role)) return false
    if (customPermissions.length === 0) return !adminOnly || isAdminRole(role)
    return customPermissions.includes(permissionKey)
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Module permissions</Text>
      <Text style={styles.hint}>
        Uncheck to restrict access. Empty selection means default role permissions apply.
      </Text>
      {Object.values(PERMISSION_CATEGORIES).map((category) => {
        if (category.adminOnly && !isAdminRole(role)) return null
        const enabled = isEnabled(category.permission, category.adminOnly)
        return (
          <View key={category.id} style={styles.block}>
            <Pressable style={styles.row} onPress={() => toggle(category.permission)}>
              <View style={[styles.checkbox, enabled && styles.checkboxOn]}>
                {enabled ? <Text style={styles.checkMark}>✓</Text> : null}
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.label}>{category.label}</Text>
                <Text style={styles.desc}>{category.description}</Text>
              </View>
            </Pressable>
            {category.subcategories?.map((sub) => {
              const subEnabled = isEnabled(sub.permission)
              return (
                <Pressable
                  key={sub.id}
                  style={[styles.row, styles.subRow]}
                  onPress={() => toggle(sub.permission)}
                >
                  <View style={[styles.checkbox, subEnabled && styles.checkboxOn]}>
                    {subEnabled ? <Text style={styles.checkMark}>✓</Text> : null}
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.subLabel}>{sub.label}</Text>
                    <Text style={styles.desc}>{sub.description}</Text>
                  </View>
                </Pressable>
              )
            })}
          </View>
        )
      })}
      <Pressable
        style={styles.resetBtn}
        onPress={() => onChange([])}
      >
        <Text style={[styles.resetText, { color: erp.primary }]}>Reset to role defaults</Text>
      </Pressable>
    </View>
  )
}

const createStyles = ({ erp }: { erp: ErpTheme }) =>
  StyleSheet.create({
    wrap: { gap: 8 },
    heading: { fontSize: 15, fontWeight: '600', color: erp.text },
    hint: { fontSize: 12, color: erp.textMuted, marginBottom: 4 },
    block: { borderWidth: 1, borderColor: erp.border, borderRadius: 10, overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, backgroundColor: erp.surface },
    subRow: { paddingLeft: 28, borderTopWidth: 1, borderTopColor: erp.border },
    rowBody: { flex: 1 },
    label: { fontSize: 14, fontWeight: '600', color: erp.text },
    subLabel: { fontSize: 13, fontWeight: '500', color: erp.text },
    desc: { fontSize: 11, color: erp.textMuted, marginTop: 2 },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: erp.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2
    },
    checkboxOn: { backgroundColor: erp.primary, borderColor: erp.primary },
    checkMark: { color: '#fff', fontSize: 13, fontWeight: '700' },
    resetBtn: { alignSelf: 'flex-start', paddingVertical: 8 },
    resetText: { fontSize: 13, fontWeight: '600' }
  })
