import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useAuth } from '../../state/AuthContext'
import { erp } from '../../theme/appTheme'
import { projectsApi } from '../api'
import type { ProjectsStackParamList } from '../navigation'
import type { ProjectNote } from '../types'
import { formatDateTime, stripHtml } from '../utils'

type Props = NativeStackScreenProps<ProjectsStackParamList, 'NoteDetail'>

export function NoteDetailScreen({ route, navigation }: Props) {
  const { projectId, noteId, projectName } = route.params
  const { accessToken } = useAuth()
  const [note, setNote] = useState<ProjectNote | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    try {
      const n = await projectsApi.getNote(accessToken, projectId, noteId)
      setNote(n)
      setTitle(n.title || '')
      setContent(stripHtml(n.content))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load note')
    } finally {
      setLoading(false)
    }
  }, [accessToken, projectId, noteId])

  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    if (!accessToken) return
    setSaving(true)
    setError('')
    try {
      const updated = await projectsApi.updateNote(accessToken, projectId, noteId, {
        title: title.trim() || 'Untitled Note',
        content
      })
      setNote(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={erp.primary} />
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <FontAwesome5 name="arrow-left" size={16} color={erp.primary} />
          <Text style={styles.backText}>{projectName || 'Project'}</Text>
        </Pressable>
        <Text style={styles.meta}>
          {[note?.author?.name, formatDateTime(note?.updatedAt || note?.createdAt)]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TextInput
          style={styles.titleInput}
          value={title}
          onChangeText={setTitle}
          placeholder="Note title"
          placeholderTextColor={erp.textSubtle}
        />
        <TextInput
          style={styles.contentInput}
          value={content}
          onChangeText={setContent}
          placeholder="Write meeting notes, decisions, follow-ups…"
          placeholderTextColor={erp.textSubtle}
          multiline
          textAlignVertical="top"
        />
        <Pressable
          style={[styles.saveBtn, saving && styles.disabled]}
          disabled={saving}
          onPress={() => void save()}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveText}>Save note</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: erp.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingTop: 12,
    paddingHorizontal: erp.space.lg,
    paddingBottom: 12,
    backgroundColor: erp.surface,
    borderBottomWidth: 1,
    borderBottomColor: erp.border
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  backText: { color: erp.primary, fontWeight: '700', fontSize: 15 },
  meta: { fontSize: 12, color: erp.textSubtle },
  body: { padding: erp.space.lg, gap: 12 },
  error: { color: erp.danger, fontWeight: '600' },
  titleInput: {
    fontSize: 22,
    fontWeight: '800',
    color: erp.text,
    paddingVertical: 8
  },
  contentInput: {
    minHeight: 240,
    borderWidth: 1,
    borderColor: erp.border,
    borderRadius: erp.radius.lg,
    padding: 14,
    backgroundColor: erp.surface,
    color: erp.text,
    fontSize: 16,
    lineHeight: 24
  },
  saveBtn: {
    backgroundColor: erp.primary,
    borderRadius: erp.radius.md,
    paddingVertical: 14,
    alignItems: 'center'
  },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  disabled: { opacity: 0.6 }
})
