import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { ToolsHomeScreen } from './screens/ToolsHomeScreen'
import { lazyNavScreen } from '../navigation/lazyNavScreen'
import type { ToolsStackParamList } from './navigation'

const Stack = createNativeStackNavigator<ToolsStackParamList>()

export function ToolsNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="ToolsHome" component={ToolsHomeScreen} />
      <Stack.Screen
        name="ExpenseCapture"
        getComponent={lazyNavScreen(() => require('./screens/ExpenseCaptureScreen').ExpenseCaptureScreen)}
      />
    </Stack.Navigator>
  )
}
