import type { TeamTabId } from './types'

export type TeamsStackParamList = {
  TeamsHome: undefined
  TeamDetail: { teamId: string; teamName?: string; initialTab?: TeamTabId; discussionId?: string }
  DiscussionDetail: { teamId: string; discussionId: string; teamName?: string }
  DiscussionForm: { teamId: string; discussionId?: string; teamName?: string }
  MeetingNotes: { teamId: string; monthKey?: string; weekKey?: string }
  SarsMonitoring: { teamId: string }
  TeamMembers: { teamId: string; teamName?: string }
  PoaReview: { teamId: string }
  DfrrCheck: { teamId: string }
  ProcessDocument: { teamId: string; documentId: string; title?: string }
  ProcessWorkflow: { teamId: string; workflowId: string; title?: string }
}
