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

async function collectStream(output: AsyncGenerator<{ type: string; content: string }>) {
  const chunks: Array<{ type: string; content: string }> = []
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
})
