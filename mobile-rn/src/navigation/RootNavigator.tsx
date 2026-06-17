import React from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import {
  NavigationContainer,
  useNavigationContainerRef
} from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { LoginScreen } from '../screens/LoginScreen'
import { DashboardScreen } from '../screens/DashboardScreen'
import { DrawerMenu } from '../components/shell/DrawerMenu'
import { JobCardSyncProvider } from '../jobcards/JobCardSyncContext'
import { useAuth } from '../state/AuthContext'
import { useAppIconBadge } from '../hooks/useAppIconBadge'
import { usePushNotifications } from '../hooks/usePushNotifications'
import { NotificationUnreadProvider, useNotificationUnread } from '../notifications/NotificationUnreadContext'
import { ChatEventsProvider, useChatEvents } from '../messages/ChatEventsContext'
import { ChatCallProvider } from '../messages/ChatCallContext'
import { navigateFromPushData } from '../notifications/notificationNavigation'
import { erpApi } from '../services/erpApi'

import type { RootStackParamList } from './types'
import { linking } from './linking'
import { getActiveRootRouteName } from './navigationHelpers'
import { setErrorReportScreen } from '../services/errorReporting'
import { useThemedStyles } from '../theme/useThemedStyles'
import type { ErpTheme } from '../theme/palettes'
import { useTheme } from '../theme/ThemeContext'

const Stack = createNativeStackNavigator<RootStackParamList>()

/** Defer heavy module trees until the user navigates to them (faster, safer cold start). */
function lazyScreenComponent<T extends React.ComponentType<unknown>>(
  loader: () => T
): T {
  let cached: T | null = null
  function LazyScreen(props: React.ComponentProps<T>) {
    const { erp } = useTheme()
    const styles = useThemedStyles(createLazyStyles)
    const [attempt, setAttempt] = React.useState(0)

    const loadResult = React.useMemo(() => {
      if (cached) return { Screen: cached, error: null as string | null }
      try {
        cached = loader()
        return { Screen: cached, error: null }
      } catch (e) {
        return {
          Screen: null,
          error: e instanceof Error ? e.message : 'Could not load screen'
        }
      }
    }, [attempt])

    if (loadResult.error) {
      return (
        <View style={styles.errorWrap}>
          <Text style={styles.errorTitle}>Could not open this module</Text>
          <Text style={styles.errorMessage}>{loadResult.error}</Text>
          <Pressable
            style={styles.retryBtn}
            onPress={() => {
              cached = null
              setAttempt((n) => n + 1)
            }}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      )
    }

    if (!loadResult.Screen) {
      return (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={erp.primary} />
        </View>
      )
    }

    const Screen = loadResult.Screen
    return <Screen {...props} />
  }
  return LazyScreen as T
}

const ClientsScreen = lazyScreenComponent(() => require('../screens/ClientsScreen').ClientsScreen)
const ProjectsScreen = lazyScreenComponent(() => require('../screens/ProjectsScreen').ProjectsScreen)
const MyTasksScreen = lazyScreenComponent(() => require('../screens/MyTasksScreen').MyTasksScreen)
const MyNotesScreen = lazyScreenComponent(() => require('../screens/MyNotesScreen').MyNotesScreen)
const NotificationsScreen = lazyScreenComponent(
  () => require('../screens/NotificationsScreen').NotificationsScreen
)
const ServiceMaintenanceScreen = lazyScreenComponent(
  () => require('../screens/ServiceMaintenanceScreen').ServiceMaintenanceScreen
)
const SettingsScreen = lazyScreenComponent(() => require('../screens/SettingsScreen').SettingsScreen)
const DashboardCustomizeScreen = lazyScreenComponent(
  () => require('../screens/DashboardCustomizeScreen').DashboardCustomizeScreen
)
const JobCardsRootScreen = lazyScreenComponent(
  () => require('../jobcards/screens/JobCardsRootScreen').JobCardsRootScreen
)
const TeamsScreen = lazyScreenComponent(() => require('../screens/TeamsScreen').TeamsScreen)
const ToolsScreen = lazyScreenComponent(() => require('../screens/ToolsScreen').ToolsScreen)
const MessagesNavigator = lazyScreenComponent(
  () => require('../messages/MessagesNavigator').MessagesNavigator
)

function lazyPlaceholderScreen(opts: {
  webPath: string
  description: string
  icon: string
}) {
  return lazyScreenComponent(() => {
    const { createPlaceholderScreen } = require('../screens/ModulePlaceholderScreen')
    return createPlaceholderScreen(opts)
  })
}

const UsersScreen = lazyScreenComponent(() => require('../screens/UsersScreen').UsersScreen)
const ManufacturingScreen = lazyScreenComponent(
  () => require('../screens/ManufacturingScreen').ManufacturingScreen
)
const HelpdeskScreen = lazyPlaceholderScreen({
  webPath: '/helpdesk',
  description: 'Tickets and support workflows on the web ERP.',
  icon: 'headset'
})
const DocumentsScreen = lazyPlaceholderScreen({
  webPath: '/documents',
  description: 'Document library — available on the web ERP.',
  icon: 'folder-open'
})
const ReportsScreen = lazyScreenComponent(() => require('../screens/ReportsScreen').ReportsScreen)

function LoadingScreen() {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={erp.primary} />
    </View>
  )
}

function AuthenticatedAppInner() {
  const navigationRef = useNavigationContainerRef<RootStackParamList>()
  const [currentRoute, setCurrentRoute] = React.useState('Dashboard')
  const { accessToken, user } = useAuth()
  const accessTokenRef = React.useRef(accessToken)
  accessTokenRef.current = accessToken
  const { refresh: refreshNotificationUnread, decrementUnread } = useNotificationUnread()
  const { refreshChatUnread } = useChatEvents()
  const decrementUnreadRef = React.useRef(decrementUnread)
  decrementUnreadRef.current = decrementUnread
  const refreshNotificationUnreadRef = React.useRef(refreshNotificationUnread)
  refreshNotificationUnreadRef.current = refreshNotificationUnread
  const refreshChatUnreadRef = React.useRef(refreshChatUnread)
  refreshChatUnreadRef.current = refreshChatUnread

  const handlePushNotification = React.useCallback((data: Parameters<typeof navigateFromPushData>[1]) => {
    const token = accessTokenRef.current
    const isChat = data.type === 'message' || !!data.conversationId
    if (data.notificationId && token) {
      void erpApi.markNotificationsRead(token, [data.notificationId]).then(() => {
        if (isChat) {
          void refreshChatUnreadRef.current()
        } else {
          decrementUnreadRef.current(1)
          void refreshNotificationUnreadRef.current()
        }
      })
    } else if (isChat) {
      void refreshChatUnreadRef.current()
    }
    if (navigationRef.current) {
      navigateFromPushData(navigationRef.current, data, user)
    }
  }, [user])

  usePushNotifications(handlePushNotification)
  useAppIconBadge()

  return (
    <JobCardSyncProvider>
      <NavigationContainer
        ref={navigationRef}
        linking={linking}
        onReady={() => {
          const root = getActiveRootRouteName(navigationRef.getRootState())
          if (root) {
            setCurrentRoute(root)
            setErrorReportScreen(root)
          }
        }}
        onStateChange={(state) => {
          const rootScreen = getActiveRootRouteName(state)
          if (!rootScreen) return
          setCurrentRoute(rootScreen)
          setErrorReportScreen(rootScreen)
        }}
      >
        <Stack.Navigator
          initialRouteName="Dashboard"
          screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
        >
          <Stack.Screen name="Dashboard" component={DashboardScreen} />
          <Stack.Screen name="Clients" component={ClientsScreen} />
          <Stack.Screen name="Projects" component={ProjectsScreen} />
          <Stack.Screen name="MyTasks" component={MyTasksScreen} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} />
          <Stack.Screen name="ServiceMaintenance" component={ServiceMaintenanceScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="DashboardCustomize" component={DashboardCustomizeScreen} />
          <Stack.Screen name="JobCards" component={JobCardsRootScreen} />
          <Stack.Screen name="Teams" component={TeamsScreen} />
          <Stack.Screen name="Users" component={UsersScreen} />
          <Stack.Screen name="Manufacturing" component={ManufacturingScreen} />
          <Stack.Screen name="Helpdesk" component={HelpdeskScreen} />
          <Stack.Screen name="Tools" component={ToolsScreen} />
          <Stack.Screen name="Documents" component={DocumentsScreen} />
          <Stack.Screen name="Messages" component={MessagesNavigator} />
          <Stack.Screen name="Reports" component={ReportsScreen} />
          <Stack.Screen name="MyNotes" component={MyNotesScreen} />
        </Stack.Navigator>
      </NavigationContainer>
      <DrawerMenu navigationRef={navigationRef} currentRoute={currentRoute} />
    </JobCardSyncProvider>
  )
}

function AuthenticatedApp() {
  return (
    <NotificationUnreadProvider>
      <ChatEventsProvider>
        <ChatCallProvider>
          <AuthenticatedAppInner />
        </ChatCallProvider>
      </ChatEventsProvider>
    </NotificationUnreadProvider>
  )
}

function AuthGate() {
  const { loading, accessToken } = useAuth()
  if (loading) return <LoadingScreen />
  if (!accessToken) {
    return (
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    )
  }
  return <AuthenticatedApp />
}

export function RootNavigator() {
  return <AuthGate />
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: erp.bg }
  })
}

function createLazyStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: erp.bg },
    errorWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: erp.bg,
      padding: 24,
      gap: 12
    },
    errorTitle: { fontSize: 18, fontWeight: '800', color: erp.text, textAlign: 'center' },
    errorMessage: { fontSize: 14, color: erp.danger, textAlign: 'center', lineHeight: 20 },
    retryBtn: {
      marginTop: 8,
      backgroundColor: erp.primary,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: erp.radius.md
    },
    retryText: { color: '#fff', fontWeight: '700' }
  })
}
