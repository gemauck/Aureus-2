import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { UsersHomeScreen } from './screens/UsersHomeScreen'
import { lazyNavScreen } from '../navigation/lazyNavScreen'
import type { UsersStackParamList } from './navigation'

const Stack = createNativeStackNavigator<UsersStackParamList>()

export function UsersNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="UsersHome" component={UsersHomeScreen} />
      <Stack.Screen
        name="UserForm"
        getComponent={lazyNavScreen(() => require('./screens/UserFormScreen').UserFormScreen)}
      />
      <Stack.Screen
        name="InviteUser"
        getComponent={lazyNavScreen(() => require('./screens/InviteUserScreen').InviteUserScreen)}
      />
    </Stack.Navigator>
  )
}
