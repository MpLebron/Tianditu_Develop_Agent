import { formatContractPrompt, getContractById, selectContractsFallback, type ContractSelectionInput } from './ContractRegistry.js'

export interface ContractSelectionResult {
  contractIds: string[]
  prompt: string
  decisionSource: 'planner' | 'analyzer' | 'fallback'
  fallbackReason?: string
}

export function selectContracts(params: ContractSelectionInput & {
  suggestedIds?: string[]
  source?: 'planner' | 'analyzer'
}): ContractSelectionResult {
  const validSuggested = dedupe(
    (params.suggestedIds || []).filter((id) => Boolean(getContractById(id))),
  )

  if (validSuggested.length > 0) {
    return {
      contractIds: validSuggested,
      prompt: formatContractPrompt(validSuggested),
      decisionSource: params.source || 'planner',
    }
  }

  const fallback = selectContractsFallback(params)
  return {
    contractIds: fallback,
    prompt: formatContractPrompt(fallback),
    decisionSource: 'fallback',
    fallbackReason: 'no_valid_suggested_contracts',
  }
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items))
}
