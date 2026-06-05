export type ProjectsStackParamList = {
  ProjectsHome: undefined
  ProjectDetail: { projectId: string; initialTab?: string }
  TaskDetail: { taskId: string; projectId: string; projectName?: string }
}
