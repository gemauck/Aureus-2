import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { ModuleHeader } from '../../components/shell/ModuleHeader'
import { ScreenBody } from '../../components/shell/ScreenBody'
import { useAuth } from '../../state/AuthContext'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'
import { teamsApi } from '../api'
import type { TeamsStackParamList } from '../navigation'

type Props = NativeStackScreenProps<TeamsStackParamList, 'DiscussionForm'>

export function DiscussionFormScreen({ navigation, route }: Props) {
  const { teamId, discussionId, teamName } = route.params
  const isEdit = !!discussionId
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { accessToken, user } = useAuth()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [type, setType] = useState<'discussion' | 'notice'>('discussion')
  const [pinned, setPinned] = useState(false)
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isEdit || !accessToken || !discussionId) return
    let cancelled = false
    void (async () => {
      try {
        const d = await teamsApi.getDiscussion(accessToken, discussionId)
        if (cancelled) return
        setTitle(d.title || '')
        setBody(d.body || '')
        setType((d.type as 'discussion' | 'notice') || 'discussion')
        setPinned(!!d.pinned)
      } catch (e) {
        Alert.alert('Discussion', e instanceof Error ? e.message : 'Could not load')
        navigation.goBack()
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [accessToken, discussionId, isEdit, navigation])

  const save = async () => {
    if (!accessToken || !title.trim() || saving) return
    setSaving(true)
    try {
      if (isEdit && discussionId) {
        await teamsApi.updateDiscussion(accessToken, discussionId, {
          title: title.trim(),
          body,
          type,
          pinned
        })
        navigation.goBack()
      } else {
        const d = await teamsApi.createDiscussion(accessToken, {
          teamId,
          title: title.trim(),
          body,
          type,
          pinned,
          authorId: user?.id,
          authorName: user?.name || user?.email
        })
        navigation.replace('DiscussionDetail', {
          teamId,
          discussionId: d.id,
          teamName
        })
      }
    } catch (e) {
      Alert.alert('Save', e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={styles.root}>
      <ModuleHeader title={isEdit ? 'Edit discussion' : 'New discussion'} showBack onBack={() => navigation.goBack()} />
      <ScreenBody>
        {loading ? (
          <ActivityIndicator color={erp.primary} />
        ) : (
          <ScrollView contentContainerStyle={styles.form}>
            <Text style={styles.label}>Title</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Discussion title"
              placeholderTextColor={erp.textSubtle}
            />
            <Text style={styles.label}>Body</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={body}
              onChangeText={setBody}
              placeholder="What would you like to discuss?"
              multiline
              textAlignVertical="top"
              placeholderTextColor={erp.textSubtle}
            />
            <View style={styles.row}>
              <Text style={styles.labelInline}>Post as notice</Text>
              <Switch
                value={type === 'notice'}
                onValueChange={(v) => setType(v ? 'notice' : 'discussion')}
              />
            </View>
            <View style={styles.row}>
              <Text style={styles.labelInline}>Pin to top</Text>
              <Switch value={pinned} onValueChange={setPinned} />
            </View>
            <Pressable
              style={[styles.saveBtn, (!title.trim() || saving) && styles.saveDisabled]}
              onPress={() => void save()}
              disabled={!title.trim() || saving}
            >
              <Text style={styles.saveText}>{saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create discussion'}</Text>
            </Pressable>
          </ScrollView>
        )}
      </ScreenBody>
    </View>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: erp.bg },
    form: { padding: erp.space.md, gap: 8, paddingBottom: 40 },
    label: { fontSize: 13, fontWeight: '600', color: erp.textMuted, marginTop: 8 },
    input: {
      borderWidth: 1,
      borderColor: erp.border,
      borderRadius: erp.radius.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: erp.text,
      backgroundColor: erp.surface
    },
    textArea: { minHeight: 120 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 12
    },
    labelInline: { fontSize: 15, color: erp.text },
    saveBtn: {
      marginTop: 24,
      backgroundColor: erp.primary,
      paddingVertical: 14,
      borderRadius: erp.radius.md,
      alignItems: 'center'
    },
    saveDisabled: { opacity: 0.5 },
    saveText: { color: '#fff', fontWeight: '600', fontSize: 16 }
  })
}
