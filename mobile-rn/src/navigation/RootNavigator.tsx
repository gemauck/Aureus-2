import React from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
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
import { usePushNotifications } from '../hooks/usePushNotifications'

import type { RootStackParamList } from './types'
import { useThemedStyles } from '../theme/useThemedStyles'
import type { ErpTheme } from '../theme/palettes'
import { useTheme } from '../theme/ThemeContext'

const Stack = createNativeStackNavigator<RootStackParamList>()

/** Defer heavy module trees until the user navigates to them (faster, safer cold start). */
function lazyScreen<T extends React.ComponentType<unknown>>(
  loader: () => T
): () => T {
  let cached: T | null = null
  return () => {
    if (!cached) cached = loader()
    return cached
  }
}

const ClientsScreen = lazyScreen(() => require('../screens/ClientsScreen').ClientsScreen)
const ProjectsScreen = lazyScreen(() => require('../screens/ProjectsScreen').ProjectsScreen)
const MyTasksScreen = lazyScreen(() => require('../screens/MyTasksScreen').MyTasksScreen)
const MyNotesScreen = lazyScreen(() => require('../screens/MyNotesScreen').MyNotesScreen)
const NotificationsScreen = lazyScreen(() => require('../screens/NotificationsScreen').NotificationsScreen)
const ServiceMaintenanceScreen = lazyScreen(
  () => require('../screens/ServiceMaintenanceScreen').ServiceMaintenanceScreen
)
const SettingsScreen = lazyScreen(() => require('../screens/SettingsScreen').SettingsScreen)
const DashboardCustomizeScreen = lazyScreen(
  () => require('../screens/DashboardCustomizeScreen').DashboardCustomizeScreen
)
const JobCardsRootScreen = lazyScreen(
  () => require('../jobcards/screens/JobCardsRootScreen').JobCardsRootScreen
)
const TeamsScreen = lazyScreen(() => require('../screens/TeamsScreen').TeamsScreen)
const ToolsScreen = lazyScreen(() => require('../screens/ToolsScreen').ToolsScreen)
const MessagesNavigator = lazyScreen(() => require('../messages/MessagesNavigator').MessagesNavigator)

function lazyPlaceholderScreen(opts: {
  webPath: string
  description: string
  icon: string
}) {
  return lazyScreen(() => {
    const { createPlaceholderScreen } = require('../screens/ModulePlaceholderScreen')
    return createPlaceholderScreen(opts)
  })
}

const UsersScreen = lazyPlaceholderScreen({
  webPath: '/users',
  description: 'User management and permissions — admin access on the web ERP.',
  icon: 'user-cog'
})
const ManufacturingScreen = lazyPlaceholderScreen({
  webPath: '/manufacturing',
  description: 'Inventory, stock movements, and production — full module on the web ERP.',
  icon: 'industry'
})
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
const ReportsScreen = lazyPlaceholderScreen({
  webPath: '/reports',
  description: 'Reports and analytics on the web ERP.',
  icon: 'chart-bar'
})

function LoadingScreen() {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={erp.primary} />
    </View>
  )
}

function AuthenticatedApp() {
  const navigationRef = useNavigationContainerRef<RootStackParamList>()
  const [currentRoute, setCurrentRoute] = React.useState('Dashboard')

  usePushNotifications((conversationId) => {
    navigationRef.current?.navigate('Messages', {
      screen: 'Chat',
      params: { conversationId, title: 'Chat' }
    } as never)
  })

  return (
    <JobCardSyncProvider>
      <NavigationContainer
        ref={navigationRef}
        onReady={() => {
          const route = navigationRef.getCurrentRoute()
          if (route?.name) setCurrentRoute(route.name)
        }}
        onStateChange={() => {
          const route = navigationRef.getCurrentRoute()
          if (route?.name) setCurrentRoute(route.name)
        }}
      >
        <Stack.Navigator
          initialRouteName="Dashboard"
          screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
        >
          <Stack.Screen name="Dashboard" component={DashboardScreen} />
          <Stack.Screen name="Clients" getComponent={ClientsScreen} />
          <Stack.Screen name="Projects" getComponent={ProjectsScreen} />
          <Stack.Screen name="MyTasks" getComponent={MyTasksScreen} />
          <Stack.Screen name="Notifications" getComponent={NotificationsScreen} />
          <Stack.Screen name="ServiceMaintenance" getComponent={ServiceMaintenanceScreen} />
          <Stack.Screen name="Settings" getComponent={SettingsScreen} />
          <Stack.Screen name="DashboardCustomize" getComponent={DashboardCustomizeScreen} />
          <Stack.Screen name="JobCards" getComponent={JobCardsRootScreen} />
          <Stack.Screen name="Teams" getComponent={TeamsScreen} />
          <Stack.Screen name="Users" getComponent={UsersScreen} />
          <Stack.Screen name="Manufacturing" getComponent={ManufacturingScreen} />
          <Stack.Screen name="Helpdesk" getComponent={HelpdeskScreen} />
          <Stack.Screen name="Tools" getComponent={ToolsScreen} />
          <Stack.Screen name="Documents" getComponent={DocumentsScreen} />
          <Stack.Screen name="Messages" getComponent={MessagesNavigator} />
          <Stack.Screen name="Reports" getComponent={ReportsScreen} />
          <Stack.Screen name="MyNotes" getComponent={MyNotesScreen} />
        </Stack.Navigator>
      </NavigationContainer>
      <DrawerMenu navigationRef={navigationRef} currentRoute={currentRoute} />
    </JobCardSyncProvider>
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
