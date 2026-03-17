export type VisualInspectStatus = 'ok' | 'unavailable'
export type VisualSeverity = 'low' | 'medium' | 'high'

export interface VisualInspectResult {
  status: VisualInspectStatus
  anomalous: boolean
  shouldRepair: boolean
  severity: VisualSeverity
  summary: string
  diagnosis: string
  repairHint: string
  confidence: number
  model: string
}

export interface VisualInspectRequest {
  code?: string
  imageBase64?: string
  dossierRunId?: string
  captureMeta?: {
    mode?: 'dom' | 'canvas'
    canvasCount?: number
    largestCanvasArea?: number
    canvasReadable?: boolean
    canvasTainted?: boolean
  }
  hint?: string
  runId?: string
}
