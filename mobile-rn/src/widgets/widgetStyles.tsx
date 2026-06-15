'use no memo'

import React from 'react'
import { FlexWidget, TextWidget } from 'react-native-android-widget'
import { WIDGET_COLORS } from './constants'
import type { WidgetSnapshot } from './widgetSnapshot'
import { formatWidgetUpdatedAt } from './widgetSnapshot'

export function SignedOutWidget({ title }: { title: string }) {
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: WIDGET_COLORS.signedOutBg,
        borderRadius: 16,
        padding: 16,
        justifyContent: 'center',
        alignItems: 'center'
      }}
      clickAction="OPEN_APP"
      accessibilityLabel="Open Abcotronics ERP to sign in"
    >
      <TextWidget
        text="Abcotronics ERP"
        style={{ fontSize: 14, fontWeight: '700', color: WIDGET_COLORS.brand, marginBottom: 6 }}
      />
      <TextWidget
        text={title}
        style={{ fontSize: 13, color: WIDGET_COLORS.textMuted, textAlign: 'center' }}
      />
      <TextWidget
        text="Tap to open app"
        style={{ fontSize: 12, color: WIDGET_COLORS.brand, marginTop: 10, fontWeight: '600' }}
      />
    </FlexWidget>
  )
}

export function WidgetHeader({
  title,
  subtitle,
  deepLink
}: {
  title: string
  subtitle?: string
  deepLink: string
}) {
  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        backgroundColor: WIDGET_COLORS.brand,
        padding: 12,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16
      }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: deepLink }}
    >
      <TextWidget text={title} style={{ fontSize: 15, fontWeight: '800', color: '#ffffff' }} />
      {subtitle ? (
        <TextWidget
          text={subtitle}
          style={{ fontSize: 11, color: '#dbeafe', marginTop: 2 }}
        />
      ) : null}
    </FlexWidget>
  )
}

export function WidgetFooter({ snapshot }: { snapshot: WidgetSnapshot }) {
  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderTopWidth: 1,
        borderTopColor: WIDGET_COLORS.border
      }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'abcotronics://dashboard' }}
    >
      <TextWidget
        text={formatWidgetUpdatedAt(snapshot.updatedAt)}
        style={{ fontSize: 10, color: WIDGET_COLORS.textMuted }}
      />
    </FlexWidget>
  )
}
