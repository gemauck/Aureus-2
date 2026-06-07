import React, { useMemo } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'

export type MentionUser = { id: string; name?: string; email?: string }

type Props = {
  users: MentionUser[]
  query: string
  onSelect: (user: MentionUser) => void
}

export function MentionSuggestions({ users, query, onSelect }: Props) {
  const styles = useThemedStyles(createStyles)
  const suggestions = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return users.slice(0, 8)
    return users
      .filter((u) => {
        const name = (u.name || '').toLowerCase()
        const email = (u.email || '').toLowerCase()
        return name.includes(q) || email.includes(q)
      })
      .slice(0, 8)
  }, [users, query])

  if (!suggestions.length) return null

  return (
    <View style={styles.wrap}>
      <FlatList
        keyboardShouldPersistTaps="handled"
        data={suggestions}
        keyExtractor={(u) => u.id}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => onSelect(item)}>
            <Text style={styles.name}>{item.name || item.email}</Text>
            {item.email && item.name ? <Text style={styles.email}>{item.email}</Text> : null}
          </Pressable>
        )}
      />
    </View>
  )
}

export function getMentionState(text: string, cursorPos: number) {
  const before = text.slice(0, cursorPos)
  const match = before.match(/@([\w.\s'-]*)$/)
  if (!match) return null
  return { start: before.length - match[0].length, query: match[1] || '' }
}

export function insertMention(text: string, start: number, cursorPos: number, label: string) {
  const mention = `@${label} `
  return text.slice(0, start) + mention + text.slice(cursorPos)
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    wrap: {
      maxHeight: 160,
      borderTopWidth: 1,
      borderTopColor: erp.border,
      backgroundColor: erp.surface
    },
    row: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: erp.border },
    name: { fontSize: 14, fontWeight: '600', color: erp.text },
    email: { fontSize: 12, color: erp.textMuted, marginTop: 2 }
  })
}
