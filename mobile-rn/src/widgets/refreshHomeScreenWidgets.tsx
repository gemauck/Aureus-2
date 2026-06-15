import { Platform } from 'react-native'
import { WIDGET_NAMES } from './constants'
import { NotificationsWidget } from './NotificationsWidget'
import { SummaryWidget } from './SummaryWidget'
import { TasksWidget } from './TasksWidget'
import type { WidgetSnapshot } from './widgetSnapshot'
import { saveWidgetSnapshot } from './widgetSnapshot'

async function requestAndroidWidgetRefresh(snapshot: WidgetSnapshot): Promise<void> {
  if (Platform.OS !== 'android') return

  try {
    const { requestWidgetUpdate } = await import('react-native-android-widget')
    await Promise.allSettled([
      requestWidgetUpdate({
        widgetName: WIDGET_NAMES.tasks,
        renderWidget: () => <TasksWidget snapshot={snapshot} />
      }),
      requestWidgetUpdate({
        widgetName: WIDGET_NAMES.notifications,
        renderWidget: () => <NotificationsWidget snapshot={snapshot} />
      }),
      requestWidgetUpdate({
        widgetName: WIDGET_NAMES.summary,
        renderWidget: () => <SummaryWidget snapshot={snapshot} />
      })
    ])
  } catch {
    // Native module unavailable until the next dev/release build includes widgets.
  }
}

export async function refreshHomeScreenWidgets(snapshot: WidgetSnapshot): Promise<void> {
  await saveWidgetSnapshot(snapshot)
  await requestAndroidWidgetRefresh(snapshot)
}

import { EMPTY_WIDGET_SNAPSHOT } from './widgetSnapshot'
