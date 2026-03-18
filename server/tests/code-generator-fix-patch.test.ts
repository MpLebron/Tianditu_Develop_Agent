import { beforeEach, describe, expect, it, vi } from 'vitest'

const streamMock = vi.fn()
const invokeMock = vi.fn()

vi.mock('../src/llm/createLLM.js', () => ({
  createLLM: () => ({
    stream: streamMock,
    invoke: invokeMock,
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

async function collectFixChunks(output: AsyncGenerator<{ type: string; content?: string; data?: unknown }>) {
  const chunks: Array<{ type: string; content?: string; data?: unknown }> = []
  for await (const chunk of output) {
    chunks.push(chunk)
  }
  return chunks
}

describe('CodeGenerator patch-first fix flow', () => {
  beforeEach(() => {
    streamMock.mockReset()
    invokeMock.mockReset()
  })

  it('retries with patch protocol guidance when the first response contains no patch blocks', async () => {
    streamMock.mockResolvedValue(createMockStream([
      '修复思路：把错误的 map.add(marker) 改成天地图 Marker 的 addTo 写法。',
    ]))

    invokeMock.mockResolvedValue({
      content: [
        '------- SEARCH',
        'map.add(marker);',
        '=======',
        'marker.addTo(map);',
        '+++++++ REPLACE',
      ].join('\n'),
    })

    const generator = new CodeGenerator()
    const chunks = await collectFixChunks(generator.fixErrorStream({
      code: [
        '<script>',
        'const marker = new TMapGL.Marker();',
        'map.add(marker);',
        '</script>',
      ].join('\n'),
      error: 'TypeError: map.add is not a function',
      skillDocs: '',
    }))

    const codeChunk = chunks.find((chunk) => chunk.type === 'code')
    const diffChunk = chunks.find((chunk) => chunk.type === 'code_diff')
    const text = chunks
      .filter((chunk) => chunk.type === 'text')
      .map((chunk) => chunk.content || '')
      .join('')

    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(text).toContain('正在按失败块重试第 1 轮')
    expect(text).not.toContain('正在回退到整页重写修复')
    expect(codeChunk?.content).toContain('marker.addTo(map);')
    expect(diffChunk?.data).toMatchObject({
      fallbackMode: 'patch',
    })
  })
})
