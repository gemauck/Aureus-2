import React from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import {
  NavigationContainer,
  useNavigationContainerRef
} from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { LoginScreen } from '../screens/LoginScreen'
import { DashboardScreen } from '../screens/DashboardScreen'
import { ClientsScreen } from '../screens/ClientsScreen'
import { ProjectsScreen } from '../screens/ProjectsScreen'
import { MyTasksScreen } from '../screens/MyTasksScreen'
import { MyNotesScreen } from '../screens/MyNotesScreen'
import { NotificationsScreen } from '../screens/NotificationsScreen'
import { ServiceMaintenanceScreen } from '../screens/ServiceMaintenanceScreen'
import { SettingsScreen } from '../screens/SettingsScreen'
import { DashboardCustomizeScreen } from '../screens/DashboardCustomizeScreen'
import { createPlaceholderScreen } from '../screens/ModulePlaceholderScreen'
import { TeamsScreen } from '../screens/TeamsScreen'
import { ToolsScreen } from '../screens/ToolsScreen'
import { JobCardsRootScreen } from '../jobcards/screens/JobCardsRootScreen'
import { MessagesNavigator } from '../messages/MessagesNavigator'
import { DrawerMenu } from '../components/shell/DrawerMenu'
import { useAuth } from '../state/AuthContext'
import { usePushNotifications } from '../hooks/usePushNotifications'

import type { RootStackParamList } from './types'
import { useThemedStyles } from '../theme/useThemedStyles'
import type { ErpTheme } from '../theme/palettes'
import { useTheme } from '../theme/ThemeContext'

const Stack = createNativeStackNavigator<RootStackParamList>()

const UsersScreen = createPlaceholderScreen({
  webPath: '/users',
  description: 'User management and permissions — admin access on the web ERP.',
  icon: 'user-cog'
})
const ManufacturingScreen = createPlaceholderScreen({
  webPath: '/manufacturing',
  description: 'Inventory, stock movements, and production — full module on the web ERP.',
  icon: 'industry'
})
const HelpdeskScreen = createPlaceholderScreen({
  webPath: '/helpdesk',
  description: 'Tickets and support workflows on the web ERP.',
  icon: 'headset'
})
const DocumentsScreen = createPlaceholderScreen({
  webPath: '/documents',
  description: 'Document library — available on the web ERP.',
  icon: 'folder-open'
})
const ReportsScreen = createPlaceholderScreen({
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
    <>
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
    </>
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