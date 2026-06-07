import React, { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { ModuleHeader } from '../../components/shell/ModuleHeader'
import { ScreenBody } from '../../components/shell/ScreenBody'
import { useAuth } from '../../state/AuthContext'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'
import { teamsApi } from '../api'
import { WorkflowDiagramView } from '../components/WorkflowDiagramView'
import type { TeamsStackParamList } from '../navigation'
import type { TeamWorkflow } from '../types'
import { parseJsonField } from '../utils'

type Props = NativeStackScreenProps<TeamsStackParamList, 'ProcessWorkflow'>

export function ProcessWorkflowScreen({ navigation, route }: Props) {
  const { workflowId, title } = route.params
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { accessToken } = useAuth()
  const [workflow, setWorkflow] = useState<TeamWorkflow | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!accessToken) return
    void (async () => {
      try {
        setWorkflow(await teamsApi.getWorkflow(accessToken, workflowId))
      } finally {
        setLoading(false)
      }
    })()
  }, [accessToken, workflowId])

  const hasDiagram = useMemo(() => {
    if (!workflow) return false
    const canvas = parseJsonField<{ drawioXml?: string; elements?: unknown[] }>(
      workflow.canvasData,
      {}
    )
    return (
      (workflow.canvasKind === 'drawio' && !!canvas.drawioXml) ||
      (workflow.canvasKind === 'excalidraw' && !!canvas.elements?.length)
    )
  }, [workflow])

  const kind = workflow?.canvasKind === 'drawio' ? 'Draw.io diagram' : 'Excalidraw diagram'

  return (
    <View style={styles.root}>
      <ModuleHeader title={workflow?.title || title || 'Workflow'} showBack onBack={() => navigation.goBack()} />
      <ScreenBody padded={false}>
        {loading ? (
          <ActivityIndicator style={styles.loader} color={erp.primary} />
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.meta}>{kind}</Text>
            {workflow?.description ? <Text style={styles.body}>{workflow.description}</Text> : null}
            {workflow && hasDiagram ? (
              <WorkflowDiagramView workflow={workflow} />
            ) : (
              <Text style={styles.empty}>No diagram data stored for this workflow yet.</Text>
            )}
          </ScrollView>
        )}
      </ScreenBody>
    </View>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: erp.bg },
    loader: { marginTop: 40 },
    content: { padding: erp.space.md, paddingBottom: 40, gap: 10, flexGrow: 1 },
    meta: { fontSize: 13, color: erp.textSubtle },
    body: { fontSize: 15, color: erp.text, lineHeight: 22 },
    empty: { fontSize: 14, color: erp.textMuted, lineHeight: 21 }
  })
}
