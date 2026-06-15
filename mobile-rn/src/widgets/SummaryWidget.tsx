'use no memo'

import React from 'react'
import { FlexWidget, TextWidget } from 'react-native-android-widget'
import { WIDGET_COLORS } from './constants'
import type { WidgetSnapshot } from './widgetSnapshot'
import { SignedOutWidget, WidgetFooter, WidgetHeader } from './widgetStyles'

type Props = {
  snapshot: WidgetSnapshot
}

function StatCell({ label, value, tint }: { label: string; value: string | number; tint: string }) {
  return (
    <FlexWidget
      style={{
        flex: 1,
        backgroundColor: '#f8fafc',
        borderRadius: 12,
        padding: 10,
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <TextWidget text={String(value)} style={{ fontSize: 24, fontWeight: '800', color: tint }} />
      <TextWidget
        text={label}
        style={{ fontSize: 10, color: WIDGET_COLORS.textMuted, marginTop: 4, fontWeight: '600' }}
      />
    </FlexWidget>
  )
}

export function SummaryWidget({ snapshot }: Props) {
  if (!snapshot.signedIn) {
    return <SignedOutWidget title="Sign in for your ERP overview" />
  }

  const greeting = snapshot.userName ? `Hi ${snapshot.userName.split(' ')[0]}` : 'ERP overview'

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
      clickActionData={{ uri: 'abcotronics://dashboard' }}
      accessibilityLabel="ERP summary widget"
    >
      <WidgetHeader title={greeting} subtitle="Your day at a glance" deepLink="abcotronics://dashboard" />

      <FlexWidget
        style={{
          width: 'match_parent',
          flex: 1,
          padding: 12,
          flexGap: 8
        }}
      >
        <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', flexGap: 8 }}>
          <StatCell label="Tasks" value={snapshot.openTaskCount} tint={WIDGET_COLORS.success} />
          <StatCell label="Unread" value={snapshot.unreadNotifications} tint={WIDGET_COLORS.warning} />
        </FlexWidget>
        <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', flexGap: 8 }}>
          <StatCell label="Active projects" value={snapshot.activeProjects} tint="#7c3aed" />
          <StatCell label="Job cards" value={snapshot.openJobCards} tint={WIDGET_COLORS.brand} />
        </FlexWidget>
      </FlexWidget>

      <WidgetFooter snapshot={snapshot} />
    </FlexWidget>
  )
}
