import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { WebView } from 'react-native-webview'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { ModuleHeader } from '../../components/shell/ModuleHeader'
import { ScreenBody } from '../../components/shell/ScreenBody'
import { useAuth } from '../../state/AuthContext'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'
import { teamsApi } from '../api'
import type { TeamsStackParamList } from '../navigation'
import type { DepartmentNotes, MeetingActionItem, MonthlyMeetingNotes } from '../types'
import { MEETING_DEPARTMENTS } from '../utils'

type Props = NativeStackScreenProps<TeamsStackParamList, 'MeetingNotes'>

function monthLabel(monthKey: string) {
  const [y, m] = monthKey.split('-').map(Number)
  if (!y || !m) return monthKey
  return new Date(y, m - 1, 1).toLocaleDateString([], { month: 'long', year: 'numeric' })
}

export function MeetingNotesScreen({ navigation, route }: Props) {
  const { monthKey: initialMonth, weekKey: initialWeek } = route.params
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { accessToken } = useAuth()
  const [months, setMonths] = useState<MonthlyMeetingNotes[]>([])
  const [monthKey, setMonthKey] = useState(initialMonth || '')
  const [monthData, setMonthData] = useState<MonthlyMeetingNotes | null>(null)
  const [weekKey, setWeekKey] = useState(initialWeek || '')
  const [deptId, setDeptId] = useState<string>(MEETING_DEPARTMENTS[0].id)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  useEffect(() => {
    savingRef.current = saving
  }, [saving])

  const loadMonths = useCallback(async () => {
    if (!accessToken) return
    const list = await teamsApi.listMeetingMonths(accessToken)
    setMonths(list)
    if (!monthKey && list.length) setMonthKey(list[0].monthKey)
  }, [accessToken, monthKey])

  const loadMonth = useCallback(
    async (silent = false) => {
      if (!accessToken || !monthKey) return
      if (!silent) setLoading(true)
      try {
        const data = await teamsApi.getMeetingMonth(accessToken, monthKey, { bustCache: silent })
        if (silent && savingRef.current) return
        setMonthData(data)
        if (data?.weeklyNotes?.length) {
          const keys = data.weeklyNotes.map((w) => w.weekKey)
          if (!weekKey || !keys.includes(weekKey)) setWeekKey(data.weeklyNotes[0].weekKey)
        }
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [accessToken, monthKey, weekKey]
  )

  useEffect(() => {
    void loadMonths()
  }, [loadMonths])

  useEffect(() => {
    void loadMonth()
  }, [loadMonth])

  useEffect(() => {
    if (!monthKey) return
    const id = setInterval(() => void loadMonth(true), 12000)
    return () => clearInterval(id)
  }, [monthKey, loadMonth])

  const week = useMemo(
    () => monthData?.weeklyNotes?.find((w) => w.weekKey === weekKey) || null,
    [monthData, weekKey]
  )

  const deptNotes = useMemo(() => {
    const found = week?.departmentNotes?.find((d) => d.departmentId === deptId)
    return found || null
  }, [week, deptId])

  const [draft, setDraft] = useState({
    successes: '',
    weekToFollow: '',
    frustrations: ''
  })

  useEffect(() => {
    setDraft({
      successes: deptNotes?.successes || '',
      weekToFollow: deptNotes?.weekToFollow || '',
      frustrations: deptNotes?.frustrations || ''
    })
  }, [deptNotes?.id, deptNotes?.successes, deptNotes?.weekToFollow, deptNotes?.frustrations])

  const saveDept = async () => {
    if (!accessToken || !deptNotes?.id || saving) return
    setSaving(true)
    try {
      await teamsApi.updateDepartmentNotes(accessToken, {
        id: deptNotes.id,
        successes: draft.successes,
        weekToFollow: draft.weekToFollow,
        frustrations: draft.frustrations
      })
      Alert.alert('Saved', 'Department notes updated.')
      void loadMonth()
    } catch (e) {
      Alert.alert('Save', e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const generateMonth = async () => {
    if (!accessToken) return
    const key = monthKey || new Date().toISOString().slice(0, 7)
    try {
      await teamsApi.generateMeetingMonth(accessToken, key)
      setMonthKey(key)
      void loadMonths()
      void loadMonth()
    } catch (e) {
      Alert.alert('Generate', e instanceof Error ? e.message : 'Could not generate month')
    }
  }

  const actionItems = useMemo(() => {
    const weekItems = week?.actionItems || []
    const monthItems = monthData?.actionItems || []
    return [...weekItems, ...monthItems]
  }, [week, monthData])

  return (
    <View style={styles.root}>
      <ModuleHeader title="Meeting notes" subtitle="Management meetings" showBack onBack={() => navigation.goBack()} />
      <ScreenBody padded={false}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthRow}>
          {months.map((m) => (
            <Pressable
              key={m.monthKey}
              style={[styles.chip, monthKey === m.monthKey && styles.chipActive]}
              onPress={() => setMonthKey(m.monthKey)}
            >
              <Text style={[styles.chipText, monthKey === m.monthKey && styles.chipTextActive]}>
                {monthLabel(m.monthKey)}
              </Text>
            </Pressable>
          ))}
          <Pressable style={styles.chipAdd} onPress={() => void generateMonth()}>
            <Text style={styles.chipAddText}>+ Month</Text>
          </Pressable>
        </ScrollView>

        {loading ? (
          <ActivityIndicator style={styles.loader} color={erp.primary} />
        ) : !monthData ? (
          <View style={styles.center}>
            <Text style={styles.empty}>No meeting notes for this month.</Text>
            <Pressable style={styles.genBtn} onPress={() => void generateMonth()}>
              <Text style={styles.genBtnText}>Generate month</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            {monthData.weeklyNotes?.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekRow}>
                {monthData.weeklyNotes.map((w) => (
                  <Pressable
                    key={w.weekKey}
                    style={[styles.chip, weekKey === w.weekKey && styles.chipActive]}
                    onPress={() => setWeekKey(w.weekKey)}
                  >
                    <Text style={[styles.chipText, weekKey === w.weekKey && styles.chipTextActive]}>
                      {w.weekKey}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            {week?.generalMinutes ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>General minutes</Text>
                <View style={styles.webWrap}>
                  <WebView
                    originWhitelist={['*']}
                    source={{ html: wrapHtml(week.generalMinutes, erp) }}
                    style={styles.webview}
                    scrollEnabled={false}
                  />
                </View>
              </View>
            ) : null}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.deptRow}>
              {MEETING_DEPARTMENTS.map((d) => (
                <Pressable
                  key={d.id}
                  style={[styles.chip, deptId === d.id && styles.chipActive]}
                  onPress={() => setDeptId(d.id)}
                >
                  <Text style={[styles.chipText, deptId === d.id && styles.chipTextActive]} numberOfLines={1}>
                    {d.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {deptNotes ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Department notes</Text>
                <Field label="Successes" value={draft.successes} onChange={(v) => setDraft((p) => ({ ...p, successes: v }))} />
                <Field label="Week to follow" value={draft.weekToFollow} onChange={(v) => setDraft((p) => ({ ...p, weekToFollow: v }))} />
                <Field label="Frustrations" value={draft.frustrations} onChange={(v) => setDraft((p) => ({ ...p, frustrations: v }))} />
                <Pressable style={[styles.saveBtn, saving && styles.saveDisabled]} onPress={() => void saveDept()} disabled={saving}>
                  <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save department notes'}</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.empty}>No department notes for this week yet.</Text>
            )}

            {actionItems.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Action items</Text>
                {actionItems.map((item) => (
                  <ActionItemRow key={item.id} item={item} />
                ))}
              </View>
            ) : null}
          </ScrollView>
        )}
      </ScreenBody>
    </View>
  )
}

function Field({
  label,
  value,
  onChange
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const styles = useThemedStyles(createStyles)
  const { erp } = useTheme()
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={onChange}
        multiline
        textAlignVertical="top"
        placeholderTextColor={erp.textSubtle}
      />
    </View>
  )
}

function ActionItemRow({ item }: { item: MeetingActionItem }) {
  const styles = useThemedStyles(createStyles)
  return (
    <View style={styles.actionRow}>
      <Text style={styles.actionTitle}>{item.title}</Text>
      <Text style={styles.actionMeta}>
        {item.status || 'open'} · {item.priority || 'medium'}
        {item.dueDate ? ` · due ${new Date(item.dueDate).toLocaleDateString()}` : ''}
      </Text>
    </View>
  )
}

function wrapHtml(body: string, erp: ErpTheme) {
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>body{font-family:-apple-system,sans-serif;font-size:15px;line-height:1.5;color:${erp.text};margin:0;padding:0;background:transparent;}</style></head>
<body>${body}</body></html>`
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: erp.bg },
    monthRow: { paddingHorizontal: erp.space.md, paddingVertical: 10, gap: 8 },
    weekRow: { paddingHorizontal: erp.space.md, gap: 8, marginBottom: 8 },
    deptRow: { paddingHorizontal: erp.space.md, gap: 8, marginBottom: 12 },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: erp.border,
      backgroundColor: erp.surface
    },
    chipActive: { borderColor: erp.primary, backgroundColor: `${erp.primary}18` },
    chipText: { fontSize: 13, color: erp.textMuted },
    chipTextActive: { color: erp.primary, fontWeight: '600' },
    chipAdd: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: erp.primary },
    chipAddText: { color: '#fff', fontSize: 13, fontWeight: '600' },
    loader: { marginTop: 32 },
    center: { padding: erp.space.lg, alignItems: 'center', gap: 12 },
    empty: { textAlign: 'center', color: erp.textMuted, padding: erp.space.md },
    genBtn: { backgroundColor: erp.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: erp.radius.md },
    genBtnText: { color: '#fff', fontWeight: '600' },
    content: { paddingBottom: 40 },
    section: { paddingHorizontal: erp.space.md, marginBottom: 20 },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: erp.text, marginBottom: 10 },
    webWrap: { minHeight: 120, borderWidth: 1, borderColor: erp.border, borderRadius: erp.radius.md, overflow: 'hidden' },
    webview: { backgroundColor: 'transparent', minHeight: 120 },
    field: { marginBottom: 12 },
    fieldLabel: { fontSize: 13, fontWeight: '600', color: erp.textMuted, marginBottom: 4 },
    fieldInput: {
      borderWidth: 1,
      borderColor: erp.border,
      borderRadius: erp.radius.md,
      padding: 10,
      minHeight: 80,
      fontSize: 15,
      color: erp.text,
      backgroundColor: erp.surface
    },
    saveBtn: {
      backgroundColor: erp.primary,
      paddingVertical: 12,
      borderRadius: erp.radius.md,
      alignItems: 'center',
      marginTop: 4
    },
    saveDisabled: { opacity: 0.6 },
    saveBtnText: { color: '#fff', fontWeight: '600' },
    actionRow: {
      backgroundColor: erp.surface,
      borderRadius: erp.radius.md,
      padding: 12,
      borderWidth: 1,
      borderColor: erp.border,
      marginBottom: 8
    },
    actionTitle: { fontSize: 14, fontWeight: '600', color: erp.text },
    actionMeta: { fontSize: 12, color: erp.textSubtle, marginTop: 4 }
  })
}
