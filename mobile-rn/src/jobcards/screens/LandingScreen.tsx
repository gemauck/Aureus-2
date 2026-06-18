import React from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { ModuleHeader } from '../../components/shell/ModuleHeader'
import { OfflineBanner } from '../../components/OfflineBanner'
import { useNetwork } from '../../hooks/useNetwork'
import { useJobCardWizard } from '../WizardContext'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { JcTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'

export function LandingScreen() {
  const { jc } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { isOnline } = useNetwork()
  const {
    loading,
    unsyncedCount,
    pendingAutoSync,
    startNewJobCard,
    openPriorList,
    openStockTake,
    openStockTransferRequest,
    openStockTransferApprovals,
    pendingTransferApprovals,
    openIncidentReport,
    openIncidentList,
    openPendingUploads,
    runSyncNow,
    openingCardId
  } = useJobCardWizard()

  return (
    <View style={styles.root}>
      <ModuleHeader title="Job cards" subtitle="Service & Maintenance" />
      <OfflineBanner visible={!isOnline} />
      {openingCardId ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={jc.primary} />
          <Text style={styles.loadingText}>Opening job card…</Text>
        </View>
      ) : null}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroWrap}>
          <View style={styles.heroIcon}>
            <Text style={styles.heroIconGlyph}>✓</Text>
          </View>
          <Text style={styles.kicker}>Field service</Text>
          <Text style={styles.title}>Job cards</Text>
          <Text style={styles.subtitle}>
            Capture visits, stock, and sign-off in one guided flow. Works offline; sync when you
            are back online.
          </Text>
        </View>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={jc.primary} />
            <Text style={styles.loadingText}>Loading technicians, clients & projects…</Text>
          </View>
        ) : null}

        <MenuButton
          icon="+"
          title="Create new job card"
          subtitle="Start the guided wizard for a new visit."
          tint={jc.primary}
          onPress={startNewJobCard}
        />
        <MenuButton
          icon="↺"
          title="View or edit existing job card"
          subtitle="Search and filter drafts and synced cards on this device."
          tint={jc.primaryDark}
          onPress={openPriorList}
        />
        <MenuButton
          icon="▦"
          title="Stock-Take"
          subtitle="Count stock by location and submit for review."
          tint={jc.accentTeal}
          onPress={openStockTake}
        />
        <MenuButton
          icon="⇄"
          title="Transfer stock"
          subtitle="Request stock from another location for approval."
          tint={jc.primary}
          onPress={openStockTransferRequest}
        />
        <MenuButton
          icon="✓"
          title="Transfer approvals"
          subtitle="Approve or reject stock leaving your location."
          tint={jc.accentTeal}
          badge={pendingTransferApprovals > 0 ? pendingTransferApprovals : undefined}
          onPress={() => openStockTransferApprovals()}
        />
        <MenuButton
          icon="!"
          title="Report incident"
          subtitle="Record a site incident with optional job card link."
          tint={jc.accentOrange}
          onPress={() => openIncidentReport()}
        />
        <MenuButton
          icon="≡"
          title="Incident reports"
          subtitle="View and edit incidents you have reported."
          tint={jc.accentOrange}
          onPress={openIncidentList}
        />

        {unsyncedCount > 0 ? (
          <View style={styles.syncBox}>
            <Text style={styles.syncTitle}>
              {pendingAutoSync
                ? 'Syncing pending uploads…'
                : `${unsyncedCount} item${unsyncedCount === 1 ? '' : 's'} waiting to sync`}
            </Text>
            <Text style={styles.syncSub}>
              Job cards, incidents, stock-take, and transfer requests upload when you are back online.
            </Text>
            <Pressable style={styles.viewPendingBtn} onPress={openPendingUploads}>
              <Text style={styles.viewPendingText}>View pending uploads</Text>
            </Pressable>
            <Pressable
              style={[styles.syncBtn, (!isOnline || pendingAutoSync) && styles.disabled]}
              disabled={!isOnline || pendingAutoSync}
              onPress={() => void runSyncNow()}
            >
              <Text style={styles.syncBtnText}>{pendingAutoSync ? 'Syncing…' : 'Sync all now'}</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </View>
  )
}

function MenuButton({
  icon,
  title,
  subtitle,
  tint,
  badge,
  onPress
}: {
  icon: string
  title: string
  subtitle: string
  tint: string
  badge?: number
  onPress: () => void
}) {
  const styles = useThemedStyles(createStyles)
  return (
    <Pressable
      style={({ pressed }) => [styles.menuBtn, pressed && styles.menuBtnPressed]}
      onPress={onPress}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${tint}14` }]}>
        <Text style={[styles.icon, { color: tint }]}>{icon}</Text>
      </View>
      <View style={styles.menuText}>
        <View style={styles.menuTitleRow}>
          <Text style={styles.menuTitle}>{title}</Text>
          {badge != null && badge > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.menuSub}>{subtitle}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  )
}

function createStyles({ jc }: { jc: JcTheme }) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: jc.bgGradientMid },
  content: { padding: jc.space.lg, gap: jc.space.sm, paddingBottom: 40 },
  heroWrap: {
    alignItems: 'center',
    paddingVertical: jc.space.lg,
    marginBottom: jc.space.sm
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: jc.radius.xl,
    backgroundColor: jc.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: jc.space.md,
    ...jc.shadow
  },
  heroIconGlyph: { color: '#fff', fontSize: 28, fontWeight: '800' },
  kicker: {
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontSize: 11,
    fontWeight: '700',
    color: jc.primary
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: jc.text,
    marginTop: 6,
    letterSpacing: -0.5,
    textAlign: 'center'
  },
  subtitle: {
    color: jc.textMuted,
    lineHeight: 22,
    marginTop: jc.space.sm,
    fontSize: 15,
    textAlign: 'center',
    maxWidth: 340
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 4
  },
  loadingText: { color: jc.textMuted, fontSize: 13, flex: 1 },
  menuBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: jc.surface,
    borderRadius: jc.radius.xxl,
    padding: jc.space.lg,
    gap: jc.space.md,
    ...jc.shadowSm,
    borderWidth: 1,
    borderColor: jc.border
  },
  menuBtnPressed: { opacity: 0.94, transform: [{ scale: 0.995 }] },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: jc.radius.lg,
    alignItems: 'center',
    justifyContent: 'center'
  },
  icon: { fontSize: 22, fontWeight: '700' },
  menuText: { flex: 1 },
  menuTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  menuTitle: { fontSize: 16, fontWeight: '700', color: jc.text },
  badge: {
    backgroundColor: jc.danger,
    borderRadius: 10,
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignItems: 'center'
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  menuSub: { fontSize: 13, color: jc.textMuted, marginTop: 3, lineHeight: 18 },
  chevron: { fontSize: 24, color: jc.primaryMuted, fontWeight: '300' },
  syncBox: {
    backgroundColor: jc.primarySoft,
    borderRadius: jc.radius.xl,
    padding: jc.space.lg,
    borderWidth: 1,
    borderColor: jc.primaryMuted,
    gap: jc.space.sm,
    marginTop: jc.space.sm
  },
  syncTitle: { fontWeight: '700', color: jc.primaryDark, fontSize: 14 },
  syncSub: { color: jc.textMuted, fontSize: 12, lineHeight: 17 },
    viewPendingBtn: {
      alignItems: 'center',
      paddingVertical: 6
    },
    viewPendingText: { color: jc.primaryDark, fontWeight: '700', fontSize: 13 },
    syncBtn: {
      backgroundColor: jc.surface,
      borderWidth: 1,
      borderColor: jc.primaryMuted,
      padding: 12,
      borderRadius: jc.radius.md,
      alignItems: 'center',
      marginTop: 4
    },
  syncBtnText: { fontWeight: '700', color: jc.primaryDark },
  disabled: { opacity: 0.5 }
  })
}