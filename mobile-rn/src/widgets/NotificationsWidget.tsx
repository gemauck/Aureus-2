'use no memo'

import React from 'react'
import { FlexWidget, TextWidget } from 'react-native-android-widget'
import { WIDGET_COLORS } from './constants'
import type { WidgetSnapshot } from './widgetSnapshot'
import { SignedOutWidget, WidgetFooter, WidgetHeader } from './widgetStyles'

type Props = {
  snapshot: WidgetSnapshot
}

export function NotificationsWidget({ snapshot }: Props) {
  if (!snapshot.signedIn) {
    return <SignedOutWidget title="Sign in to see notifications" />
  }

  const unread = snapshot.unreadNotifications
  const subtitle = unread ? `${unread} unread` : 'All caught up'

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
      clickActionData={{ uri: 'abcotronics://notifications' }}
      accessibilityLabel="Notifications widget"
    >
      <WidgetHeader title="Notifications" subtitle={subtitle} deepLink="abcotronics://notifications" />

      <FlexWidget
        style={{
          width: 'match_parent',
          flex: 1,
          paddingHorizontal: 12,
          paddingVertical: 10,
          justifyContent: 'center',
          alignItems: 'center'
        }}
      >
        <TextWidget
          text={String(unread)}
          style={{
            fontSize: 48,
            fontWeight: '800',
            color: unread ? WIDGET_COLORS.warning : WIDGET_COLORS.textMuted
          }}
        />
        <TextWidget
          text={unread === 1 ? 'unread notification' : 'unread notifications'}
          style={{ fontSize: 12, color: WIDGET_COLORS.textMuted, marginTop: 4 }}
        />
      </FlexWidget>

      <WidgetFooter snapshot={snapshot} />
    </FlexWidget>
  )
}
