import { createHash, randomUUID } from 'crypto'
import { access, mkdir, readFile, stat, writeFile } from 'fs/promises'
import { Buffer } from 'buffer'
import { resolve } from 'path'
import { config } from '../config.js'

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

interface RunDossierIndexFile {
  version: 1
  items: RunDossierSummary[]
}

export interface CreateRunInput {
  parentRunId?: string
  phase: RunPhase
  entrySource: RunEntrySource
  sampleId?: string
  userPrompt: string
  conversationHistory?: string
  existingCodeChars?: number
  modelProvider?: string
  modelName?: string
  agentMode?: string
  verifierEnabled: boolean
  requestId: string
  sessionId: string
  fileName?: string
  fileSize?: number
  fileKind?: string
}

export interface ListRunsOptions {
  page?: number
  pageSize?: number
  status?: RunStatus
  phase?: RunPhase
}

function nowTs() {
  return Date.now()
}

function clampText(value: unknown, max = 4000): string {
  return String(value || '').trim().slice(0, max)
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[max-depth]'
  if (value == null) return value
  if (typeof value === 'string') return value.length > 4000 ? `${value.slice(0, 4000)}…` : value
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => sanitizeValue(item, depth + 1))
  if (typeof value === 'object') {
    const output: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      output[key] = sanitizeValue(item, depth + 1)
    }
    return output
  }
  return clampText(String(value), 4000)
}

function fingerprintError(message: string): string {
  const normalized = String(message || '')
    .toLowerCase()
    .replace(/https?:\/\/[^\s"'`]+/g, '[url]')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
  return createHash('sha1').update(normalized).digest('hex').slice(0, 16)
}

function safeRunId(): string {
  return `run-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`
}

function sanitizeFileToken(value: string): string {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || 'artifact'
}

export class RunDossierStore {
  private readonly rootDir: string
  private readonly recordsDir: string
  private readonly artifactsDir: string
  private readonly indexPath: string
  private ready = false
  private initPromise: Promise<void> | null = null
  private indexData: RunDossierIndexFile = { version: 1, items: [] }
  private opQueue: Promise<unknown> = Promise.resolve()

  constructor(rootDir: string) {
    this.rootDir = rootDir
    this.recordsDir = resolve(rootDir, 'records')
    this.artifactsDir = resolve(rootDir, 'artifacts')
    this.indexPath = resolve(rootDir, 'index.json')
  }

  async init() {
    if (this.ready) return
    if (this.initPromise) {
      await this.initPromise
      return
    }

    this.initPromise = (async () => {
      await mkdir(this.rootDir, { recursive: true })
      await mkdir(this.recordsDir, { recursive: true })
      await mkdir(this.artifactsDir, { recursive: true })

      try {
        await access(this.indexPath)
        const raw = await readFile(this.indexPath, 'utf-8')
        const parsed = JSON.parse(raw) as RunDossierIndexFile
        if (parsed && parsed.version === 1 && Array.isArray(parsed.items)) {
          this.indexData = { version: 1, items: parsed.items }
        } else {
          this.indexData = { version: 1, items: [] }
        }
      } catch {
        this.indexData = { version: 1, items: [] }
        await this.persistIndex()
      }

      this.ready = true
    })()

    try {
      await this.initPromise
    } finally {
      this.initPromise = null
    }
  }

  async createRun(input: CreateRunInput): Promise<RunDossierRecord> {
    await this.init()
    const record: RunDossierRecord = {
      version: 1,
      summary: {
        id: safeRunId(),
        parentRunId: input.parentRunId,
        phase: input.phase,
        status: 'running',
        outcome: 'pending',
        entrySource: input.entrySource,
        sampleId: input.sampleId,
        userPrompt: clampText(input.userPrompt, 1000),
        modelProvider: clampText(input.modelProvider, 80) || undefined,
        modelName: clampText(input.modelName, 120) || undefined,
        agentMode: clampText(input.agentMode, 80) || undefined,
        verifierEnabled: input.verifierEnabled === true,
        requestId: input.requestId,
        sessionId: input.sessionId,
        fileName: input.fileName ? clampText(input.fileName, 180) : undefined,
        fileKind: input.fileKind ? clampText(input.fileKind, 80) : undefined,
        fileSize: typeof input.fileSize === 'number' ? input.fileSize : undefined,
        eventCount: 0,
        errorCount: 0,
        artifactCount: 0,
        startedAt: nowTs(),
        updatedAt: nowTs(),
      },
      request: {
        requestId: input.requestId,
        sessionId: input.sessionId,
        sampleId: input.sampleId,
        userPrompt: clampText(input.userPrompt, 8000),
        conversationHistory: input.conversationHistory ? clampText(input.conversationHistory, 8000) : undefined,
        existingCodeChars: input.existingCodeChars,
        modelProvider: clampText(input.modelProvider, 80) || undefined,
        modelName: clampText(input.modelName, 120) || undefined,
        entrySource: input.entrySource,
        fileName: input.fileName ? clampText(input.fileName, 180) : undefined,
        fileSize: typeof input.fileSize === 'number' ? input.fileSize : undefined,
        fileKind: input.fileKind ? clampText(input.fileKind, 80) : undefined,
      },
      events: [],
      errors: [],
      artifacts: [],
    }

    return this.runExclusive(async () => {
      await this.persistRecord(record)
      this.indexData.items.unshift(record.summary)
      await this.persistIndex()
      return record
    })
  }

  async updateRun(
    runId: string,
    patch: {
      status?: RunStatus
      outcome?: RunOutcome
      fileName?: string
      fileSize?: number
      fileKind?: string
      finishedAt?: number
      requestPatch?: Partial<RunRequestSnapshot>
    },
  ): Promise<RunDossierRecord> {
    return this.updateRecord(runId, (record) => {
      if (patch.status) record.summary.status = patch.status
      if (patch.outcome) record.summary.outcome = patch.outcome
      if (patch.fileName !== undefined) {
        record.summary.fileName = patch.fileName
        record.request.fileName = patch.fileName
      }
      if (patch.fileSize !== undefined) {
        record.summary.fileSize = patch.fileSize
        record.request.fileSize = patch.fileSize
      }
      if (patch.fileKind !== undefined) {
        record.summary.fileKind = patch.fileKind
        record.request.fileKind = patch.fileKind
      }
      if (patch.finishedAt) {
        record.summary.finishedAt = patch.finishedAt
      }
      if (patch.requestPatch) {
        record.request = {
          ...record.request,
          ...sanitizeValue(patch.requestPatch) as Partial<RunRequestSnapshot>,
        }
      }
    })
  }

  async appendEvent(
    runId: string,
    input: {
      type: string
      toolCallId?: string
      toolName?: string
      status?: string
      payload?: unknown
    },
  ): Promise<RunDossierRecord> {
    return this.updateRecord(runId, (record) => {
      record.events.push({
        id: randomUUID(),
        type: clampText(input.type, 120),
        toolCallId: input.toolCallId ? clampText(input.toolCallId, 120) : undefined,
        toolName: input.toolName ? clampText(input.toolName, 160) : undefined,
        status: input.status ? clampText(input.status, 40) : undefined,
        payload: sanitizeValue(input.payload),
        createdAt: nowTs(),
      })
      record.summary.eventCount = record.events.length
    })
  }

  async appendError(
    runId: string,
    input: {
      source: RunErrorRecord['source']
      message: string
      kind?: string
      details?: Record<string, unknown>
      markFailed?: boolean
      outcome?: RunOutcome
    },
  ): Promise<RunDossierRecord> {
    return this.updateRecord(runId, (record) => {
      const message = clampText(input.message, 8000)
      const fingerprint = fingerprintError(message)
      record.errors.push({
        id: randomUUID(),
        source: input.source,
        message,
        fingerprint,
        kind: input.kind ? clampText(input.kind, 80) : undefined,
        details: input.details ? sanitizeValue(input.details) as Record<string, unknown> : undefined,
        createdAt: nowTs(),
      })
      record.summary.errorCount = record.errors.length
      record.summary.latestErrorMessage = clampText(message, 400)
      record.summary.latestErrorFingerprint = fingerprint
      record.summary.latestErrorSource = input.source
      if (input.markFailed) {
        record.summary.status = 'failed'
        record.summary.outcome = input.outcome || 'request_error'
        record.summary.finishedAt = nowTs()
      }
    })
  }

  async attachTextArtifact(
    runId: string,
    kind: string,
    text: string,
    metadata?: Record<string, unknown>,
  ): Promise<RunArtifactRecord | null> {
    const content = String(text || '')
    if (!content.trim()) return null
    return this.attachArtifact(runId, kind, 'txt', 'text/plain; charset=utf-8', Buffer.from(content, 'utf-8'), metadata)
  }

  async attachJsonArtifact(
    runId: string,
    kind: string,
    value: unknown,
    metadata?: Record<string, unknown>,
  ): Promise<RunArtifactRecord | null> {
    const content = JSON.stringify(sanitizeValue(value), null, 2)
    if (!content.trim()) return null
    return this.attachArtifact(runId, kind, 'json', 'application/json', Buffer.from(content, 'utf-8'), metadata)
  }

  async attachHtmlArtifact(
    runId: string,
    kind: string,
    html: string,
    metadata?: Record<string, unknown>,
  ): Promise<RunArtifactRecord | null> {
    const content = String(html || '')
    if (!content.trim()) return null
    return this.attachArtifact(runId, kind, 'html', 'text/html; charset=utf-8', Buffer.from(content, 'utf-8'), metadata)
  }

  async attachPngBase64Artifact(
    runId: string,
    kind: string,
    imageBase64: string,
    metadata?: Record<string, unknown>,
  ): Promise<RunArtifactRecord | null> {
    const normalized = String(imageBase64 || '').trim().replace(/^data:image\/png;base64,/i, '')
    if (!normalized) return null
    try {
      const buf = Buffer.from(normalized, 'base64')
      if (!buf.length) return null
      return this.attachArtifact(runId, kind, 'png', 'image/png', buf, metadata)
    } catch {
      return null
    }
  }

  async listRuns(options?: ListRunsOptions): Promise<{ total: number; page: number; pageSize: number; items: RunDossierSummary[] }> {
    await this.init()
    const page = Math.max(1, Number(options?.page || 1))
    const pageSize = Math.max(1, Math.min(100, Number(options?.pageSize || 20)))
    let items = [...this.indexData.items].sort((a, b) => b.startedAt - a.startedAt)
    if (options?.status) items = items.filter((item) => item.status === options.status)
    if (options?.phase) items = items.filter((item) => item.phase === options.phase)
    const total = items.length
    const start = (page - 1) * pageSize
    return {
      total,
      page,
      pageSize,
      items: items.slice(start, start + pageSize),
    }
  }

  async getRun(runId: string): Promise<RunDossierRecord | null> {
    await this.init()
    try {
      return await this.readRecord(runId)
    } catch {
      return null
    }
  }

  private async attachArtifact(
    runId: string,
    kind: string,
    ext: string,
    contentType: string,
    buffer: Buffer,
    metadata?: Record<string, unknown>,
  ): Promise<RunArtifactRecord> {
    await this.init()
    return this.runExclusive(async () => {
      const record = await this.readRecord(runId)
      const folder = resolve(this.artifactsDir, runId)
      await mkdir(folder, { recursive: true })
      const fileName = `${Date.now()}-${sanitizeFileToken(kind)}.${ext}`
      const absolutePath = resolve(folder, fileName)
      await writeFile(absolutePath, buffer)
      const fileStat = await stat(absolutePath)
      const artifact: RunArtifactRecord = {
        id: randomUUID(),
        kind: clampText(kind, 120),
        relativePath: `${runId}/${fileName}`,
        contentType,
        sizeBytes: fileStat.size,
        createdAt: nowTs(),
        metadata: metadata ? sanitizeValue(metadata) as Record<string, unknown> : undefined,
      }
      record.artifacts.push(artifact)
      record.summary.artifactCount = record.artifacts.length
      record.summary.updatedAt = nowTs()
      await this.persistRecord(record)
      this.updateIndexItem(record.summary)
      await this.persistIndex()
      return artifact
    })
  }

  private async updateRecord(runId: string, updater: (record: RunDossierRecord) => void): Promise<RunDossierRecord> {
    await this.init()
    return this.runExclusive(async () => {
      const record = await this.readRecord(runId)
      updater(record)
      record.summary.updatedAt = nowTs()
      await this.persistRecord(record)
      this.updateIndexItem(record.summary)
      await this.persistIndex()
      return record
    })
  }

  private updateIndexItem(summary: RunDossierSummary) {
    const idx = this.indexData.items.findIndex((item) => item.id === summary.id)
    if (idx >= 0) {
      this.indexData.items[idx] = summary
    } else {
      this.indexData.items.unshift(summary)
    }
  }

  private async persistIndex() {
    await writeFile(this.indexPath, JSON.stringify(this.indexData, null, 2), 'utf-8')
  }

  private recordPath(runId: string) {
    return resolve(this.recordsDir, `${runId}.json`)
  }

  private async persistRecord(record: RunDossierRecord) {
    await writeFile(this.recordPath(record.summary.id), JSON.stringify(record, null, 2), 'utf-8')
  }

  private async readRecord(runId: string): Promise<RunDossierRecord> {
    const raw = await readFile(this.recordPath(runId), 'utf-8')
    return JSON.parse(raw) as RunDossierRecord
  }

  private async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const task = this.opQueue.then(fn, fn)
    this.opQueue = task.then(() => undefined, () => undefined)
    return task
  }
}

export const runDossierStore = new RunDossierStore(config.runDossiers.dir)
