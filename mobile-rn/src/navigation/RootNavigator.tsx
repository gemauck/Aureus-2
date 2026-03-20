import React from 'react'
import { Button, Text, View } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { LoginScreen } from '../screens/LoginScreen'
import { DashboardScreen } from '../screens/DashboardScreen'
import { ClientsScreen } from '../screens/ClientsScreen'
import { ProjectsScreen } from '../screens/ProjectsScreen'
import { TasksScreen } from '../screens/TasksScreen'
import { NotificationsScreen } from '../screens/NotificationsScreen'
import { AttachmentsScreen } from '../screens/AttachmentsScreen'
import { useAuth } from '../state/AuthContext'

const Stack = createNativeStackNavigator()

function HomeScreen({ navigation }: { navigation: any }) {
  const { signOut } = useAuth()
  return (
    <View style={{ flex: 1, padding: 16, gap: 10 }}>
      <Text style={{ fontSize: 24, fontWeight: '700' }}>Pilot Modules</Text>
      <Button title="Dashboard" onPress={() => navigation.navigate('Dashboard')} />
      <Button title="Clients" onPress={() => navigation.navigate('Clients')} />
      <Button title="Projects" onPress={() => navigation.navigate('Projects')} />
      <Button title="Tasks" onPress={() => navigation.navigate('Tasks')} />
      <Button title="Notifications" onPress={() => navigation.navigate('Notifications')} />
      <Button title="Attachments" onPress={() => navigation.navigate('Attachments')} />
      <Button title="Sign Out" onPress={() => signOut()} />
    </View>
  )
}

export function RootNavigator() {
  const { loading, accessToken } = useAuth()
  if (loading) return <Text style={{ padding: 20 }}>Loading...</Text>

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {!accessToken ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Dashboard" component={DashboardScreen} />
            <Stack.Screen name="Clients" component={ClientsScreen} />
            <Stack.Screen name="Projects" component={ProjectsScreen} />
            <Stack.Screen name="Tasks" component={TasksScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="Attachments" component={AttachmentsScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}
