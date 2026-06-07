import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { ManufacturingHomeScreen } from './screens/ManufacturingHomeScreen'
import { lazyNavScreen } from '../navigation/lazyNavScreen'
import type { ManufacturingStackParamList } from './navigation'

const Stack = createNativeStackNavigator<ManufacturingStackParamList>()

export function ManufacturingNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="ManufacturingHome" component={ManufacturingHomeScreen} />
      <Stack.Screen
        name="ManufacturingWeb"
        getComponent={lazyNavScreen(
          () => require('./screens/ManufacturingWebScreen').ManufacturingWebScreen
        )}
      />
    </Stack.Navigator>
  )
}
