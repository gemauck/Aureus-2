import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'

import type { ProjectSummary } from '../types'
import { ProjectStatusBadge } from './ProjectStatusBadge'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'

type Props = {
  project: ProjectSummary
  starred?: boolean
  onPress: () => void
  onToggleStar?: () => void
}

export function ProjectRow({ project, starred, onPress, onToggleStar }: Props) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)

  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.row}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(project.name || '?').charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.main}>
          <Text style={styles.name} numberOfLines={1}>
            {project.name || 'Unnamed project'}
            {project.clientName ? (
              <Text style={styles.clientInline}> · {project.clientName}</Text>
            ) : null}
          </Text>
        </View>
        {project.status ? (
          <View style={styles.badgeWrap}>
            <ProjectStatusBadge label={project.status} compact />
          </View>
        ) : null}
        {onToggleStar ? (
          <Pressable
            hitSlop={12}
            onPress={(e) => {
              e.stopPropagation?.()
              onToggleStar()
            }}
          >
            <FontAwesome5
              name="star"
              solid={!!starred}
              size={15}
              color={starred ? '#f59e0b' : erp.textSubtle}
            />
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
  card: {
    backgroundColor: erp.surface,
    borderRadius: erp.radius.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: erp.border,
    marginBottom: 6,
    ...erp.shadowSm
  },
  pressed: { opacity: 0.92 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: erp.primarySoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarText: { fontSize: 12, fontWeight: '800', color: erp.primary },
  main: { flex: 1, minWidth: 0 },
  name: { fontSize: 13, fontWeight: '700', color: erp.text, lineHeight: 17 },
  clientInline: { fontSize: 13, fontWeight: '500', color: erp.textMuted },
  badgeWrap: { flexShrink: 0, maxWidth: 110 }
  })
}