export type RunPhase = 'generate' | 'fix_runtime' | 'fix_visual'
export type RunStatus = 'running' | 'succeeded' | 'failed'
export type RunOutcome =
  | 'pending'
  | 'generated'
  | 'fixed'
  | 'runtime_error'
  | 'visual_error'
  | 'request_error'
  | 'client_disconnected'
export type RunEntrySource = 'sample' | 'upload' | 'inline' | 'none'

export interface RunArtifactRecord {
  id: string
  kind: string
  relativePath: string
  contentType: string
  sizeBytes: number
  createdAt: number
  metadata?: Record<string, unknown>
}

export interface RunEventRecord {
  id: string
  type: string
  toolCallId?: string
  toolName?: string
  status?: string
  payload?: unknown
  createdAt: number
}

export interface RunErrorRecord {
  id: string
  source: 'runtime' | 'visual' | 'verifier' | 'network' | 'server' | 'client'
  message: string
  fingerprint: string
  kind?: string
  details?: Record<string, unknown>
  createdAt: number
}

export interface RunRequestSnapshot {
  requestId: string
  sessionId: string
  sampleId?: string
  userPrompt: string
  conversationHistory?: string
  existingCodeChars?: number
  modelProvider?: string
  modelName?: string
  entrySource: RunEntrySource
  fileName?: string
  fileSize?: number
  fileKind?: string
  fileContractVersion?: string
  runtimeContractKind?: string
}

export interface RunDossierSummary {
  id: string
  parentRunId?: string
  phase: RunPhase
  status: RunStatus
  outcome: RunOutcome
  entrySource: RunEntrySource
  sampleId?: string
  userPrompt: string
  modelProvider?: string
  modelName?: string
  agentMode?: string
  verifierEnabled: boolean
  requestId: string
  sessionId: string
  fileName?: string
  fileKind?: string
  fileSize?: number
  latestErrorMessage?: string
  latestErrorFingerprint?: string
  latestErrorSource?: string
  eventCount: number
  errorCount: number
  artifactCount: number
  startedAt: number
  finishedAt?: number
  updatedAt: number
}

export interface RunDossierRecord {
  version: 1
  summary: RunDossierSummary
  request: RunRequestSnapshot
  events: RunEventRecord[]
  errors: RunErrorRecord[]
  artifacts: RunArtifactRecord[]
}

export interface RunDossierListResult {
  total: number
  page: number
  pageSize: number
  items: RunDossierSummary[]
}

export interface RunArtifactContentResult {
  artifact: RunArtifactRecord
  content?: string
  parsedJson?: unknown
  rawUrl?: string
}
