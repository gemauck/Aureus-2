import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { TeamsHomeScreen } from './screens/TeamsHomeScreen'
import { lazyNavScreen } from '../navigation/lazyNavScreen'
import type { TeamsStackParamList } from './navigation'

const Stack = createNativeStackNavigator<TeamsStackParamList>()

export function TeamsNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="TeamsHome" component={TeamsHomeScreen} />
      <Stack.Screen
        name="TeamDetail"
        getComponent={lazyNavScreen(() => require('./screens/TeamDetailScreen').TeamDetailScreen)}
      />
      <Stack.Screen
        name="DiscussionDetail"
        getComponent={lazyNavScreen(() => require('./screens/DiscussionDetailScreen').DiscussionDetailScreen)}
      />
      <Stack.Screen
        name="DiscussionForm"
        getComponent={lazyNavScreen(() => require('./screens/DiscussionFormScreen').DiscussionFormScreen)}
      />
      <Stack.Screen
        name="MeetingNotes"
        getComponent={lazyNavScreen(() => require('./screens/MeetingNotesScreen').MeetingNotesScreen)}
      />
      <Stack.Screen
        name="SarsMonitoring"
        getComponent={lazyNavScreen(() => require('./screens/SarsMonitoringScreen').SarsMonitoringScreen)}
      />
      <Stack.Screen
        name="TeamMembers"
        getComponent={lazyNavScreen(() => require('./screens/TeamMembersScreen').TeamMembersScreen)}
      />
      <Stack.Screen
        name="PoaReview"
        getComponent={lazyNavScreen(() => require('./screens/PoaReviewScreen').PoaReviewScreen)}
      />
      <Stack.Screen
        name="DfrrCheck"
        getComponent={lazyNavScreen(() => require('./screens/DfrrCheckScreen').DfrrCheckScreen)}
      />
      <Stack.Screen
        name="ProcessDocument"
        getComponent={lazyNavScreen(() => require('./screens/ProcessDocumentScreen').ProcessDocumentScreen)}
      />
      <Stack.Screen
        name="ProcessWorkflow"
        getComponent={lazyNavScreen(() => require('./screens/ProcessWorkflowScreen').ProcessWorkflowScreen)}
      />
    </Stack.Navigator>
  )
}
