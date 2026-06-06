import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View
} from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { AppHeader } from '../components/shell/AppHeader'
import { ScreenBody } from '../components/shell/ScreenBody'
import {
  DEFAULT_DASHBOARD_CONFIG,
  getQuickActionDefs,
  getWidgetDefs,
  loadDashboardConfig,
  moveItem,
  saveDashboardConfig,
  toggleHidden,
  type DashboardConfig
} from '../dashboard/dashboardConfig'

import type { RootStackParamList } from '../navigation/types'
import { useThemedStyles } from '../theme/useThemedStyles'
import type { ErpTheme } from '../theme/palettes'
import { useTheme } from '../theme/ThemeContext'

type Props = NativeStackScreenProps<RootStackParamList, 'DashboardCustomize'>

export function DashboardCustomizeScreen({ navigation }: Props) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const widgetDefs = useMemo(() => getWidgetDefs(erp), [erp])
  const quickActionDefs = useMemo(() => getQuickActionDefs(erp), [erp])
  const [config, setConfig] = useState<DashboardConfig>(DEFAULT_DASHBOARD_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void loadDashboardConfig().then((c) => {
      setConfig(c)
      setLoading(false)
    })
  }, [])

  const persist = useCallback(async (next: DashboardConfig) => {
    setConfig(next)
    setSaving(true)
    try {
      await saveDashboardConfig(next)
    } finally {
      setSaving(false)
    }
  }, [])

  const reset = () => {
    void persist(DEFAULT_DASHBOARD_CONFIG)
  }

  if (loading) {
    return (
      <View style={styles.root}>
        <AppHeader title="Customize dashboard" />
        <View style={styles.center}>
          <ActivityIndicator color={erp.primary} />
        </View>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <AppHeader
        title="Customize dashboard"
        subtitle="Choose shortcuts and widgets"
        showNotifications={false}
      />
      <ScreenBody padded={false}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.intro}>
            Toggle sections on or off and reorder them. Changes apply immediately on your dashboard.
          </Text>

          <Section title="Overview stats">
            <ConfigRow
              label="Show project & client counts"
              icon="chart-bar"
              enabled={config.showStats}
              onToggle={(enabled) => void persist({ ...config, showStats: enabled })}
              hideReorder
            />
          </Section>

          <Section title="Quick shortcuts">
            {config.quickActionOrder.map((id, idx) => {
              const def = quickActionDefs[id]
              const enabled = !config.hiddenQuickActions.includes(id)
              return (
                <ConfigRow
                  key={id}
                  label={def.label}
                  icon={def.icon}
                  tint={def.tint}
                  enabled={enabled}
                  canMoveUp={idx > 0}
                  canMoveDown={idx < config.quickActionOrder.length - 1}
                  onToggle={(on) =>
                    void persist({
                      ...config,
                      hiddenQuickActions: toggleHidden(config.hiddenQuickActions, id, on)
                    })
                  }
                  onMoveUp={() =>
                    void persist({
                      ...config,
                      quickActionOrder: moveItem(config.quickActionOrder, id, 'up')
                    })
                  }
                  onMoveDown={() =>
                    void persist({
                      ...config,
                      quickActionOrder: moveItem(config.quickActionOrder, id, 'down')
                    })
                  }
                />
              )
            })}
          </Section>

          <Section title="Dashboard widgets">
            {config.widgetOrder.map((id, idx) => {
              const def = widgetDefs[id]
              const enabled = !config.hiddenWidgets.includes(id)
              return (
                <ConfigRow
                  key={id}
                  label={def.title}
                  icon={def.icon}
                  tint={def.iconColor}
                  enabled={enabled}
                  canMoveUp={idx > 0}
                  canMoveDown={idx < config.widgetOrder.length - 1}
                  onToggle={(on) =>
                    void persist({
                      ...config,
                      hiddenWidgets: toggleHidden(config.hiddenWidgets, id, on)
                    })
                  }
                  onMoveUp={() =>
                    void persist({
                      ...config,
                      widgetOrder: moveItem(config.widgetOrder, id, 'up')
                    })
                  }
                  onMoveDown={() =>
                    void persist({
                      ...config,
                      widgetOrder: moveItem(config.widgetOrder, id, 'down')
                    })
                  }
                />
              )
            })}
          </Section>

          <Pressable style={styles.resetBtn} onPress={reset}>
            <FontAwesome5 name="undo" size={14} color={erp.textMuted} />
            <Text style={styles.resetText}>Reset to defaults</Text>
          </Pressable>

          {saving ? <Text style={styles.saving}>Saving…</Text> : null}

          <Pressable style={styles.doneBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </ScrollView>
      </ScreenBody>
    </View>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const styles = useThemedStyles(createStyles)
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  )
}

function ConfigRow({
  label,
  icon,
  tint,
  enabled,
  onToggle,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  hideReorder
}: {
  label: string
  icon: string
  tint?: string
  enabled: boolean
  onToggle: (enabled: boolean) => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  canMoveUp?: boolean
  canMoveDown?: boolean
  hideReorder?: boolean
}) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const resolvedTint = tint ?? erp.primary
  return (
    <View style={styles.configRow}>
      <View style={[styles.configIcon, { backgroundColor: `${resolvedTint}18` }]}>
        <FontAwesome5 name={icon as never} size={14} color={resolvedTint} />
      </View>
      <Text style={styles.configLabel}>{label}</Text>
      {!hideReorder ? (
        <View style={styles.reorder}>
          <Pressable
            onPress={onMoveUp}
            disabled={!canMoveUp}
            style={[styles.reorderBtn, !canMoveUp && styles.reorderBtnDisabled]}
            hitSlop={6}
          >
            <FontAwesome5 name="chevron-up" size={12} color={canMoveUp ? erp.textMuted : erp.border} />
          </Pressable>
          <Pressable
            onPress={onMoveDown}
            disabled={!canMoveDown}
            style={[styles.reorderBtn, !canMoveDown && styles.reorderBtnDisabled]}
            hitSlop={6}
          >
            <FontAwesome5 name="chevron-down" size={12} color={canMoveDown ? erp.textMuted : erp.border} />
          </Pressable>
        </View>
      ) : null}
      <Switch
        value={enabled}
        onValueChange={onToggle}
        trackColor={{ false: erp.border, true: `${erp.primary}55` }}
        thumbColor={enabled ? erp.primary : erp.surface}
      />
    </View>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: erp.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: erp.space.lg, paddingBottom: 40 },
  intro: { fontSize: 14, color: erp.textMuted, lineHeight: 21, marginBottom: 20 },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: erp.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8
  },
  sectionCard: {
    backgroundColor: erp.surface,
    borderRadius: erp.radius.lg,
    borderWidth: 1,
    borderColor: erp.border,
    overflow: 'hidden',
    ...erp.shadowSm
  },
  configRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: erp.borderLight
  },
  configIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  configLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: erp.text },
  reorder: { flexDirection: 'row', gap: 2 },
  reorderBtn: { padding: 6 },
  reorderBtnDisabled: { opacity: 0.35 },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14
  },
  resetText: { color: erp.textMuted, fontWeight: '600' },
  saving: { textAlign: 'center', color: erp.textSubtle, fontSize: 12, marginBottom: 8 },
  doneBtn: {
    backgroundColor: erp.primary,
    borderRadius: erp.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    ...erp.shadowSm
  },
  doneText: { color: '#fff', fontWeight: '800', fontSize: 16 }
  })
}