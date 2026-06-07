import type { ManufacturingTabId } from './constants'

export type ManufacturingStackParamList = {
  ManufacturingHome: undefined
  ManufacturingWeb: {
    tab: ManufacturingTabId
    title: string
    query?: Record<string, string>
  }
}
