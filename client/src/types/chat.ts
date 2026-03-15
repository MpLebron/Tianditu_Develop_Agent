export interface ThoughtChainItem {
  toolCallId: string
  toolName: string
  status: 'running' | 'done' | 'error'
  args?: unknown
  result?: unknown
  isError?: boolean
  startedAt?: number
  endedAt?: number
  decisionSource?: string
  selectedPackages?: string[]
  selectedReferences?: string[]
  selectedContracts?: string[]
  fallbackReason?: string
  vetoApplied?: boolean
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  code?: string
  timestamp: number
  streaming?: boolean
  thoughtChain?: ThoughtChainItem[]
  file?: {
    name: string
    size: number
  }
}
