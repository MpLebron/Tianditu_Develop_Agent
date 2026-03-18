export interface PatchBlockReport {
  blockIndex: number
  status: 'applied' | 'failed'
  strategy?: 'exact' | 'flexible' | 'regex' | 'fuzzy'
  occurrences: number
  message: string
  searchPreview: string
  replacePreview: string
  nearbyContext?: string
  range?: {
    start: number
    end: number
    startLine: number
    endLine: number
  }
}

export interface CodeDiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  header: string
}

export interface CodeDiffPayload {
  beforeCode: string
  afterCode: string
  unifiedDiff: string
  hunks: CodeDiffHunk[]
  summary: string
  fallbackMode: 'patch' | 'rewrite'
  blockReports: PatchBlockReport[]
}
