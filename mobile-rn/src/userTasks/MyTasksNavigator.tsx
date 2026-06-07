import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { MyTasksHomeScreen } from './screens/MyTasksHomeScreen'
import { UserTaskDetailScreen } from './screens/UserTaskDetailScreen'
import type { MyTasksStackParamList } from './navigation'

const Stack = createNativeStackNavigator<MyTasksStackParamList>()

export function MyTasksNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="MyTasksHome" component={MyTasksHomeScreen} />
      <Stack.Screen name="UserTaskDetail" component={UserTaskDetailScreen} />
    </Stack.Navigator>
  )
}
