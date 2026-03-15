import { formatContractPrompt, selectContractsFallback, type ContractSelectionInput } from './ContractRegistry.js'

export type ApiContractSelectionInput = ContractSelectionInput

export function buildApiContractPrompt(input: ApiContractSelectionInput): string {
  return formatContractPrompt(selectContractsFallback(input))
}
