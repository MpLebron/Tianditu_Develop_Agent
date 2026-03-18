export interface PatchBlock {
  blockIndex: number
  search: string
  replace: string
  occurrenceIndex?: number
}

export type PatchApplyStrategy = 'exact' | 'flexible' | 'regex' | 'fuzzy'

export interface PatchMatchRange {
  start: number
  end: number
  startLine: number
  endLine: number
}

export interface PatchBlockReport {
  blockIndex: number
  status: 'applied' | 'failed'
  strategy?: PatchApplyStrategy
  occurrences: number
  message: string
  searchPreview: string
  replacePreview: string
  nearbyContext?: string
  range?: PatchMatchRange
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
  patchBlocks?: PatchBlock[]
  patchText?: string
}

export interface PatchApplyResult {
  success: boolean
  hadFailures: boolean
  newCode: string
  unifiedDiff: string
  hunks: CodeDiffHunk[]
  summary: string
  blockReports: PatchBlockReport[]
  appliedBlockCount: number
  failedBlockCount: number
}
