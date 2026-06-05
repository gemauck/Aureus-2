import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { CrmHomeScreen } from './screens/CrmHomeScreen'
import { CrmDetailScreen } from './screens/CrmDetailScreen'
import type { CrmStackParamList } from './navigation'

const Stack = createNativeStackNavigator<CrmStackParamList>()

export function CrmNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="CrmHome" component={CrmHomeScreen} />
      <Stack.Screen name="CrmDetail" component={CrmDetailScreen} />
    </Stack.Navigator>
  )
}
