'use no memo'

import React from 'react'
import { FlexWidget, TextWidget } from 'react-native-android-widget'
import { WIDGET_COLORS } from './constants'
import type { WidgetSnapshot } from './widgetSnapshot'
import { SignedOutWidget, WidgetFooter, WidgetHeader } from './widgetStyles'

type Props = {
  snapshot: WidgetSnapshot
  compact?: boolean
}

export function TasksWidget({ snapshot, compact = false }: Props) {
  if (!snapshot.signedIn) {
    return <SignedOutWidget title="Sign in to see your tasks" />
  }

  const tasks = snapshot.topTasks.slice(0, compact ? 0 : 3)
  const countLabel =
    snapshot.openTaskCount === 1 ? '1 open task' : `${snapshot.openTaskCount} open tasks`

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: WIDGET_COLORS.surface,
        borderRadius: 16,
        overflow: 'hidden'
      }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'abcotronics://my-tasks' }}
      accessibilityLabel="My tasks widget"
    >
      <WidgetHeader title="My Tasks" subtitle={countLabel} deepLink="abcotronics://my-tasks" />

      <FlexWidget
        style={{
          width: 'match_parent',
          flex: 1,
          paddingHorizontal: 12,
          paddingVertical: compact ? 10 : 8,
          justifyContent: compact ? 'center' : 'flex-start'
        }}
      >
        {compact ? (
          <TextWidget
            text={String(snapshot.openTaskCount)}
            style={{ fontSize: 42, fontWeight: '800', color: WIDGET_COLORS.success }}
          />
        ) : tasks.length ? (
          tasks.map((task, index) => (
            <FlexWidget
              key={task.id}
              style={{
                width: 'match_parent',
                paddingVertical: 8,
                borderBottomWidth: index < tasks.length - 1 ? 1 : 0,
                borderBottomColor: WIDGET_COLORS.border
              }}
            >
              <TextWidget
                text={task.title || 'Untitled task'}
                style={{ fontSize: 13, fontWeight: '600', color: WIDGET_COLORS.text }}
                maxLines={1}
              />
            </FlexWidget>
          ))
        ) : (
          <TextWidget
            text="All caught up — no open tasks."
            style={{ fontSize: 13, color: WIDGET_COLORS.textMuted, paddingVertical: 8 }}
          />
        )}
      </FlexWidget>

      <WidgetFooter snapshot={snapshot} />
    </FlexWidget>
  )
}
