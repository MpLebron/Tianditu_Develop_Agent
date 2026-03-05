export type VisualInspectStatus = 'ok' | 'unavailable'
export type VisualSeverity = 'low' | 'medium' | 'high'

export interface VisualInspectResult {
  status: VisualInspectStatus
  anomalous: boolean
  severity: VisualSeverity
  summary: string
  diagnosis: string
  repairHint: string
  confidence: number
  model: string
}

