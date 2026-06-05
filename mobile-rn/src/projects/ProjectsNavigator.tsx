import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { ProjectDetailScreen } from './screens/ProjectDetailScreen'
import { ProjectsHomeScreen } from './screens/ProjectsHomeScreen'
import { TaskDetailScreen } from './screens/TaskDetailScreen'
import type { ProjectsStackParamList } from './navigation'

const Stack = createNativeStackNavigator<ProjectsStackParamList>()

export function ProjectsNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="ProjectsHome" component={ProjectsHomeScreen} />
      <Stack.Screen name="ProjectDetail" component={ProjectDetailScreen} />
      <Stack.Screen name="TaskDetail" component={TaskDetailScreen} />
    </Stack.Navigator>
  )
}
