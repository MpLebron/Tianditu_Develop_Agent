import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { config } from '../src/config.js'
import { assertPublicUrl, isPrivateIp } from '../src/agent/WebFetchService.js'
import { WorkspaceSnippetEditService } from '../src/agent/WorkspaceSnippetEditService.js'

const createdDirs: string[] = []
const originalWorkspaceRoot = config.agentTools.workspaceRoot

afterEach(async () => {
  config.agentTools.workspaceRoot = originalWorkspaceRoot
  await Promise.all(createdDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('agent tools', () => {
  it('blocks localhost/private destinations for web fetch', async () => {
    await expect(assertPublicUrl(new URL('http://localhost:3000/test'))).rejects.toThrow(/禁止访问/)
    expect(isPrivateIp('127.0.0.1')).toBe(true)
    expect(isPrivateIp('10.0.0.1')).toBe(true)
    expect(isPrivateIp('8.8.8.8')).toBe(false)
  })

  it('applies exact snippet replacement within workspace root', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'tianditu-agent-tools-'))
    createdDirs.push(workspace)
    config.agentTools.workspaceRoot = workspace

    const filePath = join(workspace, 'demo.ts')
    await writeFile(filePath, [
      'const model = "qwen3-coder-next"',
      'const api = "/api/chat"',
      'export { model, api }',
      '',
    ].join('\n'), 'utf-8')

    const service = new WorkspaceSnippetEditService()
    const result = await service.apply({
      filePath: 'demo.ts',
      oldString: 'qwen3-coder-next',
      newString: 'qwen3.5-plus',
      expectedOccurrences: 1,
    })

    const updated = await readFile(filePath, 'utf-8')
    expect(updated).toContain('qwen3.5-plus')
    expect(result.startLine).toBe(1)
    expect(result.previewBefore).toContain('qwen3-coder-next')
    expect(result.previewAfter).toContain('qwen3.5-plus')
  })
})
