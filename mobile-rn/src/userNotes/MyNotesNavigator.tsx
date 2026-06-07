import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { MyNotesHomeScreen } from './screens/MyNotesHomeScreen'
import { MyNoteDetailScreen } from './screens/MyNoteDetailScreen'
import type { MyNotesStackParamList } from './navigation'

const Stack = createNativeStackNavigator<MyNotesStackParamList>()

export function MyNotesNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="MyNotesHome" component={MyNotesHomeScreen} />
      <Stack.Screen name="MyNoteDetail" component={MyNoteDetailScreen} />
    </Stack.Navigator>
  )
}
