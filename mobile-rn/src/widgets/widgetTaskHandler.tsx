import type { WidgetTaskHandlerProps } from 'react-native-android-widget'
import { WIDGET_NAMES } from './constants'
import { NotificationsWidget } from './NotificationsWidget'
import { SummaryWidget } from './SummaryWidget'
import { TasksWidget } from './TasksWidget'
import { loadWidgetSnapshot } from './widgetSnapshot'

const nameToRenderer = {
  [WIDGET_NAMES.tasks]: TasksWidget,
  [WIDGET_NAMES.notifications]: NotificationsWidget,
  [WIDGET_NAMES.summary]: SummaryWidget
} as const

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const widgetName = props.widgetInfo.widgetName as keyof typeof nameToRenderer
  const Widget = nameToRenderer[widgetName]
  if (!Widget) return

  if (props.widgetAction === 'WIDGET_DELETED') return

  const snapshot = await loadWidgetSnapshot()
  const compact = widgetName === WIDGET_NAMES.tasks && props.widgetInfo.height < 120

  props.renderWidget(
    widgetName === WIDGET_NAMES.tasks ? (
      <TasksWidget snapshot={snapshot} compact={compact} />
    ) : (
      <Widget snapshot={snapshot} />
    )
  )
}
