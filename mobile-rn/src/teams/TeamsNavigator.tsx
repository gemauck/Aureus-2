import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { TeamsHomeScreen } from './screens/TeamsHomeScreen'
import { TeamDetailScreen } from './screens/TeamDetailScreen'
import { DiscussionDetailScreen } from './screens/DiscussionDetailScreen'
import { DiscussionFormScreen } from './screens/DiscussionFormScreen'
import { MeetingNotesScreen } from './screens/MeetingNotesScreen'
import { SarsMonitoringScreen } from './screens/SarsMonitoringScreen'
import { TeamMembersScreen } from './screens/TeamMembersScreen'
import { PoaReviewScreen } from './screens/PoaReviewScreen'
import { DfrrCheckScreen } from './screens/DfrrCheckScreen'
import { ProcessDocumentScreen } from './screens/ProcessDocumentScreen'
import { ProcessWorkflowScreen } from './screens/ProcessWorkflowScreen'
import type { TeamsStackParamList } from './navigation'

const Stack = createNativeStackNavigator<TeamsStackParamList>()

export function TeamsNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="TeamsHome" component={TeamsHomeScreen} />
      <Stack.Screen name="TeamDetail" component={TeamDetailScreen} />
      <Stack.Screen name="DiscussionDetail" component={DiscussionDetailScreen} />
      <Stack.Screen name="DiscussionForm" component={DiscussionFormScreen} />
      <Stack.Screen name="MeetingNotes" component={MeetingNotesScreen} />
      <Stack.Screen name="SarsMonitoring" component={SarsMonitoringScreen} />
      <Stack.Screen name="TeamMembers" component={TeamMembersScreen} />
      <Stack.Screen name="PoaReview" component={PoaReviewScreen} />
      <Stack.Screen name="DfrrCheck" component={DfrrCheckScreen} />
      <Stack.Screen name="ProcessDocument" component={ProcessDocumentScreen} />
      <Stack.Screen name="ProcessWorkflow" component={ProcessWorkflowScreen} />
    </Stack.Navigator>
  )
}
