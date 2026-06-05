import React from 'react'
import { JobCardWizardProvider, useJobCardWizard } from '../WizardContext'
import { LandingScreen } from './LandingScreen'
import { PriorListScreen } from './PriorListScreen'
import { WizardScreen } from './WizardScreen'
import { StockTakeScreen } from '../stockTake/StockTakeScreen'

function JobCardsFlowRouter() {
  const { wizardFlow } = useJobCardWizard()
  switch (wizardFlow) {
    case 'prior_list':
      return <PriorListScreen />
    case 'form':
      return <WizardScreen />
    case 'stock_take':
      return <StockTakeScreen />
    case 'landing':
    default:
      return <LandingScreen />
  }
}

export function JobCardsRootScreen() {
  return (
    <JobCardWizardProvider>
      <JobCardsFlowRouter />
    </JobCardWizardProvider>
  )
}
