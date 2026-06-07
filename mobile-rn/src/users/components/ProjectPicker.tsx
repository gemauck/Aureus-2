import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { projectsApi } from '../../projects/api'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'

type Project = { id: string; name?: string }

type Props = {
  token: string
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

export function ProjectPicker({ token, selectedIds, onChange }: Props) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    projectsApi
      .listProjects(token, { limit: 500 })
      .then((list) => {
        if (!cancelled) {
          setProjects(list.map((p) => ({ id: p.id, name: p.name })))
        }
      })
      .catch(() => {
        if (!cancelled) setProjects([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id])
  }

  if (loading) {
    return <ActivityIndicator color={erp.primary} style={styles.loader} />
  }

  if (!projects.length) {
    return <Text style={styles.empty}>No projects available.</Text>
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Accessible projects (guest)</Text>
      {projects.map((project) => {
        const selected = selectedIds.includes(project.id)
        return (
          <Pressable key={project.id} style={styles.row} onPress={() => toggle(project.id)}>
            <View style={[styles.checkbox, selected && styles.checkboxOn]}>
              {selected ? <Text style={styles.checkMark}>✓</Text> : null}
            </View>
            <Text style={styles.name}>{project.name || project.id}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const createStyles = ({ erp }: { erp: ErpTheme }) =>
  StyleSheet.create({
    wrap: { gap: 6 },
    heading: { fontSize: 13, fontWeight: '600', color: erp.text, marginBottom: 4 },
    loader: { marginVertical: 8 },
    empty: { fontSize: 12, color: erp.textMuted },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: erp.border,
      borderRadius: 8,
      backgroundColor: erp.surface
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: erp.border,
      alignItems: 'center',
      justifyContent: 'center'
    },
    checkboxOn: { backgroundColor: erp.primary, borderColor: erp.primary },
    checkMark: { color: '#fff', fontSize: 12, fontWeight: '700' },
    name: { flex: 1, fontSize: 14, color: erp.text }
  })
