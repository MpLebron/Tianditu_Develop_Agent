import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { config } from '../src/config.js'
import { assertPublicUrl, isPrivateIp } from '../src/agent/WebFetchService.js'
import { extractSearchResultsFromDuckDuckGoHtml } from '../src/agent/WebSearchService.js'
import { WorkspaceSnippetEditService } from '../src/agent/WorkspaceSnippetEditService.js'

const createdDirs: string[] = []
const originalWorkspaceRoot = config.agentTools.workspaceRoot

afterEach(async () => {
  config.agentTools.workspaceRoot = originalWorkspaceRoot
  await Promise.all(createdDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('agent tools', () => {
  it('parses duckduckgo html results into title/url/snippet', () => {
    const html = `
      <html><body>
        <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdoc">Example Doc</a>
        <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdoc">Official guide for tool calling.</a>
        <a class="result__a" href="https://example.org/blog">Blog Post</a>
        <div class="result__snippet">A longer implementation note.</div>
      </body></html>
    `

    const results = extractSearchResultsFromDuckDuckGoHtml(html)
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({
      title: 'Example Doc',
      url: 'https://example.com/doc',
      snippet: 'Official guide for tool calling.',
    })
    expect(results[1]?.title).toBe('Blog Post')
    expect(results[1]?.url).toBe('https://example.org/blog')
  })

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
