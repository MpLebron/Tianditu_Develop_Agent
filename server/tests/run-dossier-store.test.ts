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

  it('filters runs and reads artifact content', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'run-dossier-'))
    tempDirs.push(dir)
    const store = new RunDossierStore(dir)

    const sampleRun = await store.createRun({
      phase: 'generate',
      entrySource: 'sample',
      sampleId: 'fulian-centers',
      userPrompt: '生成妇联中心专题图',
      verifierEnabled: true,
      requestId: 'req-3',
      sessionId: 'sid-3',
    })

    const uploadRun = await store.createRun({
      phase: 'fix_visual',
      entrySource: 'upload',
      userPrompt: '修复空白地图',
      verifierEnabled: true,
      requestId: 'req-4',
      sessionId: 'sid-4',
    })

    await store.appendError(uploadRun.summary.id, {
      source: 'visual',
      message: '页面空白',
      markFailed: true,
      outcome: 'visual_error',
    })
    const artifact = await store.attachTextArtifact(uploadRun.summary.id, 'generated-code', '<html>ok</html>')

    const filtered = await store.listRuns({ entrySource: 'upload', outcome: 'visual_error', q: '空白地图' })
    expect(filtered.total).toBe(1)
    expect(filtered.items[0]?.id).toBe(uploadRun.summary.id)

    const read = await store.readArtifact(uploadRun.summary.id, artifact?.id || '')
    expect(read?.artifact.kind).toBe('generated-code')
    expect(read?.buffer.toString('utf-8')).toContain('<html>ok</html>')

    const unmatched = await store.listRuns({ q: 'fulian-centers' })
    expect(unmatched.total).toBe(1)
    expect(unmatched.items[0]?.id).toBe(sampleRun.summary.id)
  })
})
