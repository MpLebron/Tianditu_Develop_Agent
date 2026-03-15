import type { SkillDomainId } from './SkillStore.js'

export type AgentRuntimeMode = 'legacy' | 'shadow' | 'agent_first_generate' | 'agent_first_full'
export type DecisionSource = 'llm' | 'validator' | 'fallback' | 'shadow' | 'analyzer'

export interface DomainDecision {
  packageIds: string[]
  intent: string
  reason: string
  confidence: number
  raw: string
  decisionSource: DecisionSource
  parseFailed?: boolean
  fallbackReason?: string
}

export interface ReferencePlan {
  action: 'read_skill_docs' | 'generate'
  referenceIds: string[]
  contractIds: string[]
  packageIds: string[]
  reason: string
  confidence: number
  riskFlags: string[]
  raw: string
  decisionSource: DecisionSource
  parseFailed?: boolean
  fallbackReason?: string
}

export interface ErrorEvidence {
  errorText: string
  lowerText: string
  matchedSignals: string[]
  urls: string[]
  codeSignals: string[]
}

export interface ErrorAnalysisResult {
  category: 'syntax' | 'runtime' | 'network' | 'data' | 'api' | 'sandbox' | 'unknown'
  likelyCause: string
  confidence: number
  suggestedPackages: string[]
  suggestedReferences: string[]
  suggestedContracts: string[]
  fixChecklist: string[]
  raw: string
  decisionSource: DecisionSource
  fallbackReason?: string
}

export interface VerificationResult {
  issues: VerificationIssue[]
  blocking: boolean
  critique: string
}

export interface VerificationIssue {
  severity: 'error' | 'warning'
  code: string
  message: string
  suggestion: string
}

export interface PlanningPolicyCard {
  id: string
  title: string
  appliesTo: Array<'generate' | 'fix'>
  domains?: SkillDomainId[]
  guidance: string[]
}
