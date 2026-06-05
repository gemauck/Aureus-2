import React, { useCallback } from 'react'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { ModuleListScreen } from '../components/shell/ModuleListScreen'
import { erpApi } from '../services/erpApi'
import { useAuth } from '../state/AuthContext'
import type { RootStackParamList } from '../navigation/types'

type Props = NativeStackScreenProps<RootStackParamList, 'MyTasks'>

export function MyTasksScreen({ navigation }: Props) {
  const { accessToken } = useAuth()

  const loadItems = useCallback(async () => {
    if (!accessToken) return []
    const [projectTasks, userTasks] = await Promise.all([
      erpApi.getProjectTasks(accessToken).catch(() => []),
      erpApi.getUserTasks(accessToken).catch(() => [])
    ])
    const seen = new Set<string>()
    const merged = [...userTasks, ...projectTasks].filter((t) => {
      if (!t.id || seen.has(t.id)) return false
      seen.add(t.id)
      return true
    })
    return merged
  }, [accessToken])

  return (
    <ModuleListScreen
      title="My Tasks"
      subtitle="Project tasks and personal to-dos"
      navigation={navigation}
      loadItems={loadItems}
      keyExtractor={(item) => item.id}
      renderTitle={(item) => item.title || item.name || 'Untitled task'}
      renderSubtitle={(item) => [item.projectName, item.status].filter(Boolean).join(' · ')}
      searchFilter={(item, q) =>
        `${item.title || ''} ${item.name || ''} ${item.projectName || ''}`.toLowerCase().includes(q)
      }
      emptyLabel="No tasks assigned to you."
    />
  )
}
