import React from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { ModuleHeader } from '../../components/shell/ModuleHeader'
import { OfflineBanner } from '../../components/OfflineBanner'
import { useNetwork } from '../../hooks/useNetwork'
import { useJobCardWizard } from '../WizardContext'
import { jc } from '../theme'

export function LandingScreen() {
  const { isOnline } = useNetwork()
  const {
    loading,
    unsyncedCount,
    pendingAutoSync,
    startNewJobCard,
    openPriorList,
    openStockTake,
    runSyncNow
  } = useJobCardWizard()

  return (
    <View style={styles.root}>
      <ModuleHeader title="Job cards" subtitle="Service & Maintenance" />
      <OfflineBanner visible={!isOnline} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>Field service</Text>
          <Text style={styles.title}>Job cards</Text>
          <Text style={styles.subtitle}>
            Capture visits, stock, and sign-off — online or offline.
          </Text>
        </View>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={jc.primary} />
            <Text style={styles.loadingText}>Refreshing reference data…</Text>
          </View>
        ) : null}

        <MenuButton
          icon="✚"
          title="New job card"
          subtitle="Guided 5-step wizard for a site visit."
          tint="#0284c7"
          onPress={startNewJobCard}
        />
        <MenuButton
          icon="☰"
          title="Existing job cards"
          subtitle="Search, filter, reopen drafts and synced cards."
          tint="#0369a1"
          onPress={openPriorList}
        />
        <MenuButton
          icon="▦"
          title="Stock-Take"
          subtitle="Count stock by location and submit for review."
          tint="#0d9488"
          onPress={openStockTake}
        />

        {unsyncedCount > 0 ? (
          <View style={styles.syncBox}>
            <Text style={styles.syncTitle}>
              {pendingAutoSync
                ? 'Syncing to server…'
                : `${unsyncedCount} card${unsyncedCount === 1 ? '' : 's'} waiting to sync`}
            </Text>
            <Pressable
              style={[styles.syncBtn, (!isOnline || pendingAutoSync) && styles.disabled]}
              disabled={!isOnline || pendingAutoSync}
              onPress={() => void runSyncNow()}
            >
              <Text style={styles.syncBtnText}>{pendingAutoSync ? 'Syncing…' : 'Sync now'}</Text>
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
  onPress
}: {
  icon: string
  title: string
  subtitle: string
  tint: string
  onPress: () => void
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.menuBtn, pressed && styles.menuBtnPressed]}
      onPress={onPress}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${tint}18` }]}>
        <Text style={[styles.icon, { color: tint }]}>{icon}</Text>
      </View>
      <View style={styles.menuText}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuSub}>{subtitle}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: jc.bg },
  content: { padding: jc.space.lg, gap: jc.space.sm, paddingBottom: 40 },
  hero: {
    backgroundColor: jc.primary,
    borderRadius: jc.radius.xl,
    padding: jc.space.xl,
    marginBottom: jc.space.sm,
    ...jc.shadow
  },
  kicker: {
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontSize: 11,
    fontWeight: '700',
    color: '#bae6fd'
  },
  title: { fontSize: 28, fontWeight: '800', color: '#fff', marginTop: 4, letterSpacing: -0.5 },
  subtitle: { color: '#e0f2fe', lineHeight: 22, marginTop: 8, fontSize: 15 },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 4
  },
  loadingText: { color: jc.textMuted, fontSize: 13 },
  menuBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: jc.surface,
    borderRadius: jc.radius.lg,
    padding: jc.space.lg,
    gap: jc.space.md,
    ...jc.shadow,
    borderWidth: 1,
    borderColor: jc.border
  },
  menuBtnPressed: { opacity: 0.92, transform: [{ scale: 0.995 }] },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  icon: { fontSize: 20, fontWeight: '700' },
  menuText: { flex: 1 },
  menuTitle: { fontSize: 17, fontWeight: '700', color: jc.text },
  menuSub: { fontSize: 13, color: jc.textMuted, marginTop: 3, lineHeight: 18 },
  chevron: { fontSize: 22, color: jc.textSubtle, fontWeight: '300' },
  syncBox: {
    backgroundColor: '#fffbeb',
    borderRadius: jc.radius.lg,
    padding: jc.space.lg,
    borderWidth: 1,
    borderColor: '#fde68a',
    gap: jc.space.sm,
    marginTop: jc.space.sm
  },
  syncTitle: { fontWeight: '600', color: '#92400e' },
  syncBtn: {
    backgroundColor: jc.surface,
    borderWidth: 1,
    borderColor: '#fcd34d',
    padding: 12,
    borderRadius: jc.radius.md,
    alignItems: 'center'
  },
  syncBtnText: { fontWeight: '700', color: '#b45309' },
  disabled: { opacity: 0.5 }
})
