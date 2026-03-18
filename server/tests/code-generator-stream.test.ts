import { beforeEach, describe, expect, it, vi } from 'vitest'

const streamMock = vi.fn()

vi.mock('../src/llm/createLLM.js', () => ({
  createLLM: () => ({
    stream: streamMock,
    invoke: vi.fn(),
  }),
}))

const { CodeGenerator } = await import('../src/agent/CodeGenerator.js')

function createMockStream(chunks: string[]) {
  return (async function* () {
    for (const chunk of chunks) {
      yield { content: chunk }
    }
  })()
}

async function collectStream(output: AsyncGenerator<{ type: string; content?: string; data?: unknown }>) {
  const chunks: Array<{ type: string; content?: string; data?: unknown }> = []
  for await (const chunk of output) {
    chunks.push(chunk)
  }
  return chunks
}

describe('CodeGenerator streaming completion', () => {
  beforeEach(() => {
    streamMock.mockReset()
  })

  it('emits final code as soon as the first complete html appears and suppresses trailing code tail', async () => {
    streamMock.mockResolvedValue(createMockStream([
      '说明文字\n```html\n<!DOCTYPE html><html><body><div id="app"></div></body></html>',
      '\n<script>console.log("duplicate tail")</script>',
      '```\n补充说明',
    ]))

    const generator = new CodeGenerator()
    const chunks = await collectStream(generator.generateStream({
      userInput: '生成一个地图',
      skillDocs: '',
    }))

    const codeEvents = chunks.filter((chunk) => chunk.type === 'code')
    const textContent = chunks.filter((chunk) => chunk.type === 'text').map((chunk) => chunk.content).join('')
    const codeDeltaContent = chunks.filter((chunk) => chunk.type === 'code_delta').map((chunk) => chunk.content).join('')

    expect(codeEvents).toHaveLength(1)
    expect(codeEvents[0]?.content).toContain('</html>')
    expect(codeDeltaContent).not.toContain('duplicate tail')
    expect(textContent).toContain('说明文字')
    expect(textContent).not.toContain('补充说明')
    expect(chunks.some((chunk) => chunk.type === 'error')).toBe(false)
  })

  it('does not trigger recovery fallback when complete html appears before fenced code closes', async () => {
    streamMock.mockResolvedValue(createMockStream([
      '```html\n<!DOCTYPE html><html><body><div id="app"></div></body></html>\n',
      '继续输出一些尾巴但没有闭合围栏',
    ]))

    const generator = new CodeGenerator()
    const chunks = await collectStream(generator.generateStream({
      userInput: '生成一个地图',
      skillDocs: '',
    }))

    const codeEvents = chunks.filter((chunk) => chunk.type === 'code')
    const textContent = chunks.filter((chunk) => chunk.type === 'text').map((chunk) => chunk.content).join('')

    expect(codeEvents).toHaveLength(1)
    expect(codeEvents[0]?.content).toContain('</html>')
    expect(chunks.some((chunk) => chunk.type === 'error')).toBe(false)
    expect(textContent).not.toContain('检测到输出在代码中途结束')
    expect(textContent).not.toContain('检测到上一次输出被截断')
  })

  it('ignores any later html code block after the first complete html has already been emitted', async () => {
    streamMock.mockResolvedValue(createMockStream([
      '前置说明\n```html\n<!DOCTYPE html><html><body><div id="app"></div></body></html>```',
      '\n补充说明\n```html\n<script>console.log("duplicate block")</script>\n```',
      '\n结束说明',
    ]))

    const generator = new CodeGenerator()
    const chunks = await collectStream(generator.generateStream({
      userInput: '生成一个地图',
      skillDocs: '',
    }))

    const codeEvents = chunks.filter((chunk) => chunk.type === 'code')
    const codeDeltaContent = chunks.filter((chunk) => chunk.type === 'code_delta').map((chunk) => chunk.content).join('')
    const textContent = chunks.filter((chunk) => chunk.type === 'text').map((chunk) => chunk.content).join('')

    expect(codeEvents).toHaveLength(1)
    expect(codeEvents[0]?.content).toBe('<!DOCTYPE html><html><body><div id="app"></div></body></html>')
    expect(codeDeltaContent).not.toContain('duplicate block')
    expect(textContent).not.toContain('补充说明')
    expect(textContent).not.toContain('结束说明')
  })

  it('emits a code_diff after final code when updating existing code for a new request', async () => {
    streamMock.mockResolvedValue(createMockStream([
      [
        '修改思路：把标题更新成新版地图。',
        '------- SEARCH',
        '<div id="app">旧版地图</div>',
        '=======',
        '<div id="app">新版地图</div>',
        '+++++++ REPLACE',
      ].join('\n'),
    ]))

    const generator = new CodeGenerator()
    const chunks = await collectStream(generator.generateStream({
      userInput: '把标题改成新版地图',
      skillDocs: '',
      existingCode: '<!DOCTYPE html><html><body><div id="app">旧版地图</div></body></html>',
    }))

    const codeIndex = chunks.findIndex((chunk) => chunk.type === 'code')
    const diffIndex = chunks.findIndex((chunk) => chunk.type === 'code_diff')
    const diffChunk = diffIndex >= 0 ? chunks[diffIndex] : undefined

    expect(codeIndex).toBeGreaterThanOrEqual(0)
    expect(diffIndex).toBeGreaterThan(codeIndex)
    expect(diffChunk?.data).toMatchObject({
      summary: '已根据新需求更新现有代码，以下高亮显示本次改动。',
      fallbackMode: 'patch',
    })
  })

  it('prefers local patch updates instead of whole-document rewrite when existing code is provided', async () => {
    streamMock.mockResolvedValue(createMockStream([
      [
        '修改思路：移除标题中的图标，不调整其余布局。',
        '------- SEARCH',
        '<span class="panel-icon">📍</span>',
        '=======',
        '',
        '+++++++ REPLACE',
      ].join('\n'),
    ]))

    const generator = new CodeGenerator()
    const chunks = await collectStream(generator.generateStream({
      userInput: '不要加任何icon',
      skillDocs: '',
      existingCode: [
        '<!DOCTYPE html><html><body>',
        '<div class="panel-title"><span class="panel-icon">📍</span><span>村落改造地块概览</span></div>',
        '</body></html>',
      ].join('\n'),
    }))

    const codeChunk = chunks.find((chunk) => chunk.type === 'code')
    const diffChunk = chunks.find((chunk) => chunk.type === 'code_diff')
    const text = chunks
      .filter((chunk) => chunk.type === 'text')
      .map((chunk) => chunk.content || '')
      .join('')

    expect(codeChunk?.content).toContain('<span>村落改造地块概览</span>')
    expect(codeChunk?.content).not.toContain('📍')
    expect(text).toContain('已按局部 patch 完成需求更新')
    expect(diffChunk?.data).toMatchObject({
      fallbackMode: 'patch',
    })
  })

  it('treats the first generated page as a diff from an empty file', async () => {
    streamMock.mockResolvedValue(createMockStream([
      '```html\n<!DOCTYPE html><html><body><div id="app">首版页面</div></body></html>\n```',
    ]))

    const generator = new CodeGenerator()
    const chunks = await collectStream(generator.generateStream({
      userInput: '创建一个基础地图页面',
      skillDocs: '',
    }))

    const codeIndex = chunks.findIndex((chunk) => chunk.type === 'code')
    const diffIndex = chunks.findIndex((chunk) => chunk.type === 'code_diff')
    const diffChunk = diffIndex >= 0 ? chunks[diffIndex] : undefined

    expect(codeIndex).toBeGreaterThanOrEqual(0)
    expect(diffIndex).toBeGreaterThan(codeIndex)
    expect(diffChunk?.data).toMatchObject({
      beforeCode: '',
      summary: '已生成首版代码，以下高亮显示从空文件到当前页面的新增内容。',
      fallbackMode: 'patch',
    })
  })
})
