import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { MessagesHomeScreen } from './screens/MessagesHomeScreen'
import { ChatScreen } from './screens/ChatScreen'
import type { MessagesStackParamList } from './navigation'

const Stack = createNativeStackNavigator<MessagesStackParamList>()

export function MessagesNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: true, headerBackTitle: 'Back' }}>
      <Stack.Screen name="MessagesHome" component={MessagesHomeScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={({ route }) => ({ title: route.params.title || 'Chat' })}
      />
    </Stack.Navigator>
  )
}
