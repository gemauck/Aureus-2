import type {
  NavigationContainerRef,
  NavigationProp,
  ParamListBase,
  NavigationState,
  PartialState
} from '@react-navigation/native'
import type { ManufacturingTabId } from '../manufacturing/constants'
import type { RootStackParamList } from './types'

export type RootNavigation = NavigationProp<RootStackParamList> | NavigationContainerRef<RootStackParamList>

/** Root stack screens — permission guard must only run on these, not nested leaf routes. */
export const ROOT_STACK_SCREENS: ReadonlySet<keyof RootStackParamList> = new Set([
  'Dashboard',
  'Clients',
  'Projects',
  'MyTasks',
  'MyNotes',
  'Teams',
  'Users',
  'Manufacturing',
  'ServiceMaintenance',
  'Helpdesk',
  'Tools',
  'Documents',
  'Messages',
  'Notifications',
  'Reports',
  'Settings',
  'DashboardCustomize',
  'JobCards',
  'Login'
])

/** Screens that should never be redirected away from by the access guard. */
export const ALWAYS_ACCESSIBLE_ROOT_SCREENS: ReadonlySet<keyof RootStackParamList> = new Set([
  'Dashboard',
  'Settings',
  'DashboardCustomize',
  'Notifications',
  'MyTasks',
  'MyNotes'
])

export function getActiveRootRouteName(
  state: NavigationState | PartialState<NavigationState> | undefined
): keyof RootStackParamList | null {
  if (!state?.routes?.length) return null
  const index = state.index ?? state.routes.length - 1
  const route = state.routes[index]
  if (!route?.name) return null
  const name = route.name as keyof RootStackParamList
  return ROOT_STACK_SCREENS.has(name) ? name : null
}

export function navigateRoot(
  navigation: Pick<RootNavigation, 'navigate'>,
  screen: keyof RootStackParamList,
  params?: RootStackParamList[keyof RootStackParamList]
) {
  if (params === undefined) {
    navigation.navigate(screen)
    return
  }
  navigation.navigate(screen, params as never)
}

export function navigateManufacturingWeb(
  navigation: Pick<RootNavigation, 'navigate'>,
  tab: ManufacturingTabId,
  opts?: { title?: string; query?: Record<string, string> }
) {
  const title =
    opts?.title ||
    (tab === 'dashboard'
      ? 'Dashboard'
      : tab.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))
  navigateRoot(navigation, 'Manufacturing', {
    screen: 'ManufacturingWeb',
    params: { tab, title, query: opts?.query }
  })
}

export function navigateJobCards(
  navigation: Pick<RootNavigation, 'navigate'>,
  params?: RootStackParamList['JobCards']
) {
  navigateRoot(navigation, 'JobCards', params)
}

export function navigateIncidentReport(
  navigation: Pick<RootNavigation, 'navigate'>,
  opts?: NonNullable<RootStackParamList['JobCards']>
) {
  navigateJobCards(navigation, {
    initialFlow: 'incident_form',
    incidentId: opts?.incidentId,
    incidentPrefill: opts?.incidentPrefill
  })
}

export function navigateIncidentList(navigation: Pick<RootNavigation, 'navigate'>) {
  navigateJobCards(navigation, { initialFlow: 'incident_list' })
}

export function navigateProjects(
  navigation: Pick<RootNavigation, 'navigate'>,
  screen: 'ProjectDetail' | 'ProjectsHome',
  params?: ParamListBase[string]
) {
  navigateRoot(navigation, 'Projects', { screen, params } as RootStackParamList['Projects'])
}

export function navigateMyTasks(
  navigation: Pick<RootNavigation, 'navigate'>,
  screen: 'MyTasksHome' | 'UserTaskDetail',
  params?: { taskId: string; isNew?: boolean }
) {
  navigateRoot(navigation, 'MyTasks', { screen, params })
}
