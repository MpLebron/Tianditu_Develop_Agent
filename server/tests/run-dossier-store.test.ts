import { mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, describe, expect, it } from 'vitest'
import { RunDossierStore } from '../src/services/RunDossierStore.js'

const tempDirs: string[] = []

describe('RunDossierStore', () => {
  afterEach(async () => {
    while (tempDirs.length) {
      const dir = tempDirs.pop()
      if (dir) {
        await rm(dir, { recursive: true, force: true })
      }
    }
  })

  it('creates a run and lists it in the index', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'run-dossier-'))
    tempDirs.push(dir)
    const store = new RunDossierStore(dir)

    const created = await store.createRun({
      phase: 'generate',
      entrySource: 'sample',
      sampleId: 'long-march',
      userPrompt: '生成长征专题图',
      modelProvider: 'qwen',
      modelName: 'qwen3.5-plus',
      agentMode: 'agent_first_full',
      verifierEnabled: true,
      requestId: 'req-1',
      sessionId: 'sid-1',
    })

    const listed = await store.listRuns({ page: 1, pageSize: 10 })
    expect(created.summary.status).toBe('running')
    expect(listed.total).toBe(1)
    expect(listed.items[0]?.id).toBe(created.summary.id)
  })

  it('appends events, errors and artifacts into a dossier record', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'run-dossier-'))
    tempDirs.push(dir)
    const store = new RunDossierStore(dir)

    const created = await store.createRun({
      phase: 'fix_runtime',
      entrySource: 'inline',
      userPrompt: '自动修复',
      verifierEnabled: true,
      requestId: 'req-2',
      sessionId: 'sid-2',
    })

    await store.appendEvent(created.summary.id, {
      type: 'tool_execution_start',
      toolName: 'file_intelligence.inspect',
      status: 'running',
      payload: { featureCount: 268 },
    })
    await store.appendError(created.summary.id, {
      source: 'runtime',
      message: 'Cannot read properties of undefined (reading getSource)',
      markFailed: true,
      outcome: 'runtime_error',
    })
    await store.attachTextArtifact(created.summary.id, 'file-context', 'example context')

    const record = await store.getRun(created.summary.id)
    expect(record).toBeTruthy()
    expect(record?.events).toHaveLength(1)
    expect(record?.errors).toHaveLength(1)
    expect(record?.artifacts).toHaveLength(1)
    expect(record?.summary.status).toBe('failed')
    expect(record?.summary.outcome).toBe('runtime_error')
  })
})
