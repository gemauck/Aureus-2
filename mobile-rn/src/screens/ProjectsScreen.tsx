import React, { useCallback } from 'react'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { ModuleListScreen } from '../components/shell/ModuleListScreen'
import { apiClient } from '../services/apiClient'
import { useAuth } from '../state/AuthContext'
import type { RootStackParamList } from '../navigation/types'

type Props = NativeStackScreenProps<RootStackParamList, 'Projects'>

export function ProjectsScreen({ navigation }: Props) {
  const { accessToken } = useAuth()

  const loadItems = useCallback(async () => {
    if (!accessToken) return []
    return apiClient.getProjects(accessToken)
  }, [accessToken])

  return (
    <ModuleListScreen
      title="Projects"
      subtitle="Active and archived projects"
      navigation={navigation}
      loadItems={loadItems}
      keyExtractor={(item) => item.id}
      renderTitle={(item) => item.name || item.id}
      renderSubtitle={(item) => item.status}
      searchFilter={(item, q) => `${item.name || ''} ${item.status || ''}`.toLowerCase().includes(q)}
      emptyLabel="No projects found."
    />
  )
}
