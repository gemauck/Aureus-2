import React from 'react'
import type { RouteProp } from '@react-navigation/native'
import type { RootStackParamList } from '../../navigation/types'
import { JobCardWizardProvider, useJobCardWizard } from '../WizardContext'
import { LandingScreen } from './LandingScreen'
import { PriorListScreen } from './PriorListScreen'
import { WizardScreen } from './WizardScreen'
import { StockTakeScreen } from '../stockTake/StockTakeScreen'
import { IncidentFormScreen } from '../incidents/IncidentFormScreen'

type Props = {
  route: RouteProp<RootStackParamList, 'JobCards'>
}

function JobCardsFlowRouter() {
  const { wizardFlow } = useJobCardWizard()
  switch (wizardFlow) {
    case 'prior_list':
      return <PriorListScreen />
    case 'form':
      return <WizardScreen />
    case 'stock_take':
      return <StockTakeScreen />
    case 'incident_form':
      return <IncidentFormScreen />
    case 'landing':
    default:
      return <LandingScreen />
  }
}

export function JobCardsRootScreen({ route }: Props) {
  const jobCardId = route.params?.jobCardId
  const initialFlow = route.params?.initialFlow
  return (
    <JobCardWizardProvider initialJobCardId={jobCardId} initialFlow={initialFlow}>
      <JobCardsFlowRouter />
    </JobCardWizardProvider>
  )
}
