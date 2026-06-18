import React from 'react'
import type { RouteProp } from '@react-navigation/native'
import type { RootStackParamList } from '../../navigation/types'
import { JobCardWizardProvider, useJobCardWizard } from '../WizardContext'
import { LandingScreen } from './LandingScreen'
import { PriorListScreen } from './PriorListScreen'
import { WizardScreen } from './WizardScreen'
import { StockTakeScreen } from '../stockTake/StockTakeScreen'
import { StockTransferRequestScreen } from '../stockTransferRequest/StockTransferRequestScreen'
import { StockTransferApprovalsScreen } from '../stockTransferRequest/StockTransferApprovalsScreen'
import { IncidentFormScreen } from '../incidents/IncidentFormScreen'
import { IncidentListScreen } from '../incidents/IncidentListScreen'
import { PendingUploadsScreen } from './PendingUploadsScreen'

type Props = {
  route: RouteProp<RootStackParamList, 'JobCards'>
}

function JobCardsFlowRouter() {
  const { wizardFlow, transferApprovalRequestId } = useJobCardWizard()
  switch (wizardFlow) {
    case 'prior_list':
      return <PriorListScreen />
    case 'form':
      return <WizardScreen />
    case 'stock_take':
      return <StockTakeScreen />
    case 'stock_transfer_request':
      return <StockTransferRequestScreen />
    case 'stock_transfer_approvals':
      return <StockTransferApprovalsScreen initialRequestId={transferApprovalRequestId || undefined} />
    case 'incident_form':
      return <IncidentFormScreen />
    case 'incident_list':
      return <IncidentListScreen />
    case 'pending_uploads':
      return <PendingUploadsScreen />
    case 'landing':
    default:
      return <LandingScreen />
  }
}

export function JobCardsRootScreen({ route }: Props) {
  const jobCardId = route.params?.jobCardId
  const initialFlow = route.params?.initialFlow
  const transferRequestId = route.params?.transferRequestId
  const incidentPrefill = route.params?.incidentPrefill
  const incidentId = route.params?.incidentId
  return (
    <JobCardWizardProvider
      initialJobCardId={jobCardId}
      initialFlow={initialFlow}
      initialTransferRequestId={transferRequestId}
      initialIncidentPrefill={incidentPrefill}
      initialIncidentId={incidentId}
    >
      <JobCardsFlowRouter />
    </JobCardWizardProvider>
  )
}
