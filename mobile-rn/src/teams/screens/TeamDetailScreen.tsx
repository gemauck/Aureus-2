import React, { useEffect, useMemo, useState } from 'react'
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
import { FontAwesome5 } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { AppHeader } from '../../components/shell/AppHeader'
import { ScreenBody } from '../../components/shell/ScreenBody'
import { chatApi } from '../../messages/api'
import { useAuth } from '../../state/AuthContext'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'
import { teamsApi } from '../api'
import { DiscussionsTab } from '../components/DiscussionsTab'
import { ProcessFlowsTab } from '../components/ProcessFlowsTab'
import type { TeamsStackParamList } from '../navigation'
import type { Team, TeamTabId } from '../types'
import { getTeamTabs, isTeamAccessible, tabLabel, teamAccentColor } from '../utils'

type Props = NativeStackScreenProps<TeamsStackParamList, 'TeamDetail'>

export function TeamDetailScreen({ navigation, route }: Props) {
  const { teamId, teamName, initialTab, discussionId } = route.params
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { accessToken, user } = useAuth()
  const [team, setTeam] = useState<Team | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TeamTabId>(initialTab || 'discussions')
  const [search, setSearch] = useState('')
  const [messageLoading, setMessageLoading] = useState(false)

  const tabs = useMemo(() => getTeamTabs(teamId, user), [teamId, user])

  useEffect(() => {
    if (!isTeamAccessible(teamId, user)) {
      Alert.alert('Access denied', 'Only administrators can access this team.')
      navigation.goBack()
    }
  }, [teamId, user, navigation])

  useEffect(() => {
    if (initialTab && tabs.includes(initialTab)) setActiveTab(initialTab)
  }, [initialTab, tabs])

  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const t = await teamsApi.getTeam(accessToken, teamId)
        if (!cancelled) setTeam(t)
      } catch {
        if (!cancelled) setTeam({ id: teamId, name: teamName || teamId })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [accessToken, teamId, teamName])

  const messageTeam = async () => {
    if (!accessToken || messageLoading) return
    setMessageLoading(true)
    try {
      const conv = await chatApi.openTeamChat(accessToken, teamId)
      navigation.getParent()?.navigate('Messages', {
        screen: 'Chat',
        params: { conversationId: conv.id, title: team?.name || teamName || 'Team chat' }
      } as never)
    } catch (e) {
      Alert.alert('Team chat', e instanceof Error ? e.message : 'Could not open team chat')
    } finally {
      setMessageLoading(false)
    }
  }

  const openTabScreen = (tab: TeamTabId) => {
    switch (tab) {
      case 'meeting-notes':
        navigation.navigate('MeetingNotes', { teamId })
        break
      case 'sars-monitoring':
        navigation.navigate('SarsMonitoring', { teamId })
        break
      case 'poa-review':
        navigation.navigate('PoaReview', { teamId })
        break
      case 'dfrr-check':
        navigation.navigate('DfrrCheck', { teamId })
        break
      case 'members':
        navigation.navigate('TeamMembers', { teamId, teamName: team?.name || teamName })
        break
      default:
        setActiveTab(tab)
    }
  }

  const displayName = team?.name || teamName || 'Team'
  const accent = team ? teamAccentColor(team) : erp.primary
  const showSearch = activeTab === 'discussions' || activeTab === 'process-flows'

  return (
    <View style={styles.root}>
      <AppHeader
        title={displayName}
        subtitle="Team knowledge hub"
        onNotificationsPress={() => navigation.getParent()?.navigate('Notifications')}
        rightSlot={
          <Pressable style={styles.msgBtn} onPress={() => void messageTeam()} disabled={messageLoading}>
            {messageLoading ? (
              <ActivityIndicator size="small" color={erp.primary} />
            ) : (
              <FontAwesome5 name="comment-dots" size={17} color={erp.primary} />
            )}
          </Pressable>
        }
      />
      <ScreenBody padded={false}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {tabs.map((tab) => {
            const active = activeTab === tab && !['meeting-notes', 'sars-monitoring', 'poa-review', 'dfrr-check', 'members'].includes(tab)
            const isExternal = ['meeting-notes', 'sars-monitoring', 'poa-review', 'dfrr-check', 'members'].includes(tab)
            return (
              <Pressable
                key={tab}
                style={[styles.tab, active && { backgroundColor: `${accent}22`, borderColor: accent }]}
                onPress={() => (isExternal ? openTabScreen(tab) : setActiveTab(tab))}
              >
                <Text style={[styles.tabText, active && { color: accent, fontWeight: '600' }]}>
                  {tabLabel(tab)}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>

        {showSearch ? (
          <View style={styles.searchWrap}>
            <TextInput
              style={styles.search}
              placeholder={activeTab === 'process-flows' ? 'Search flows and documents…' : 'Search discussions…'}
              value={search}
              onChangeText={setSearch}
              placeholderTextColor={erp.textSubtle}
            />
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator style={styles.loader} color={erp.primary} />
        ) : activeTab === 'discussions' ? (
          <DiscussionsTab
            teamId={teamId}
            teamName={displayName}
            search={search}
            initialDiscussionId={discussionId}
            navigation={navigation}
          />
        ) : activeTab === 'process-flows' ? (
          <ProcessFlowsTab teamId={teamId} search={search} navigation={navigation} />
        ) : null}
      </ScreenBody>
    </View>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: erp.bg },
    msgBtn: { padding: 6 },
    tabs: { paddingHorizontal: erp.space.md, paddingVertical: 10, gap: 8 },
    tab: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: erp.border,
      backgroundColor: erp.surface
    },
    tabText: { fontSize: 13, color: erp.textMuted },
    searchWrap: { paddingHorizontal: erp.space.md, paddingBottom: 8 },
    search: {
      backgroundColor: erp.surface,
      borderWidth: 1,
      borderColor: erp.border,
      borderRadius: erp.radius.md,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
      color: erp.text
    },
    loader: { marginTop: 32 }
  })
}
