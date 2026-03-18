import { describe, expect, it, vi } from 'vitest'
import { NativeToolLoop } from '../src/agent/NativeToolLoop.js'

function createResponse(payload: {
  id?: string
  outputText?: string
  output?: Array<Record<string, unknown>>
}) {
  return {
    id: payload.id || 'resp-test-1',
    output_text: payload.outputText || '',
    output: payload.output || [],
  }
}

describe('native tool loop', () => {
  it('lets the model answer capability questions directly without tools', async () => {
    const fetchUrl = vi.fn()
    const apply = vi.fn()
    const responsesCreate = vi.fn().mockResolvedValueOnce(createResponse({
      outputText: '{"replyMode":"tool_only","reason":"用户在询问能力说明","assistantText":"可以，我支持联网搜索和网页抓取。"}',
    }))
    const toolAvailabilityInvoke = vi.fn().mockResolvedValueOnce({
      content: '{"availableTools":["web_search","web_fetch","snippet_edit"],"reason":"能力问句场景允许保留全部工具。"}',
    })

    const loop = new NativeToolLoop({
      webFetch: { fetchUrl } as any,
      snippetEdit: { apply } as any,
      responsesClientFactory: () => ({
        responses: { create: responsesCreate },
      }),
      toolAvailabilityModelFactory: () => ({ invoke: toolAvailabilityInvoke }),
    })

    let finalResult: any
    for await (const event of loop.run({
      userInput: '你能联网搜索吗',
      localCapabilityCatalog: '<available_packages><package>tianditu-jsapi</package></available_packages>',
      mode: 'generate',
    })) {
      if (event.type === 'final') finalResult = event.result
    }

    const firstRequest = responsesCreate.mock.calls[0]?.[0] as Record<string, any>
    expect(firstRequest.tools.some((tool: Record<string, unknown>) => tool.type === 'web_search')).toBe(true)
    expect(fetchUrl).not.toHaveBeenCalled()
    expect(apply).not.toHaveBeenCalled()
    expect(finalResult.replyMode).toBe('tool_only')
    expect(finalResult.finalText).toContain('联网搜索')
  })

  it('lets the model clarify short follow-ups from conversation history without tools', async () => {
    const fetchUrl = vi.fn()
    const apply = vi.fn()
    const responsesCreate = vi.fn().mockResolvedValueOnce(createResponse({
      outputText: '{"replyMode":"tool_only","reason":"用户在追问上一轮回复的含义","assistantText":"我的意思是：我可以帮你联网搜索具体内容。"}',
    }))
    const toolAvailabilityInvoke = vi.fn().mockResolvedValueOnce({
      content: '{"availableTools":["web_search","web_fetch","snippet_edit"],"reason":"澄清问句保持默认工具集合。"}',
    })

    const loop = new NativeToolLoop({
      webFetch: { fetchUrl } as any,
      snippetEdit: { apply } as any,
      responsesClientFactory: () => ({
        responses: { create: responsesCreate },
      }),
      toolAvailabilityModelFactory: () => ({ invoke: toolAvailabilityInvoke }),
    })

    let finalResult: any
    for await (const event of loop.run({
      userInput: '啥？',
      conversationHistory: '用户: 你能联网搜索吗\n助手: 可以，我支持联网搜索和网页抓取。',
      localCapabilityCatalog: '<available_packages><package>tianditu-jsapi</package></available_packages>',
      mode: 'generate',
    })) {
      if (event.type === 'final') finalResult = event.result
    }

    expect(fetchUrl).not.toHaveBeenCalled()
    expect(apply).not.toHaveBeenCalled()
    expect(finalResult.replyMode).toBe('tool_only')
    expect(finalResult.finalText).toContain('我的意思是')
  })

  it('captures builtin web search calls and uses them in tool_only answers', async () => {
    const fetchUrl = vi.fn()
    const apply = vi.fn()
    const responsesCreate = vi.fn().mockResolvedValueOnce(createResponse({
      outputText: '{"replyMode":"tool_only","reason":"已查到外部信息","assistantText":"我已经查到《生命树》的公开资料。"}',
      output: [
        {
          type: 'web_search_call',
          id: 'search-1',
          action: {
            query: '最近热播的生命树',
            type: 'search',
            sources: [
              { type: 'url', url: 'https://example.com/life-tree' },
            ],
          },
        },
      ],
    }))
    const toolAvailabilityInvoke = vi.fn().mockResolvedValueOnce({
      content: '{"availableTools":["web_search","web_fetch","snippet_edit"],"reason":"需要外部公开资料，保留 web_search。"}',
    })

    const loop = new NativeToolLoop({
      webFetch: { fetchUrl } as any,
      snippetEdit: { apply } as any,
      responsesClientFactory: () => ({
        responses: { create: responsesCreate },
      }),
      toolAvailabilityModelFactory: () => ({ invoke: toolAvailabilityInvoke }),
    })

    let finalResult: any
    for await (const event of loop.run({
      userInput: '你知道最近热播的生命树吗',
      localCapabilityCatalog: '<available_packages><package>tianditu-jsapi</package></available_packages>',
      mode: 'generate',
    })) {
      if (event.type === 'final') finalResult = event.result
    }

    expect(fetchUrl).not.toHaveBeenCalled()
    expect(finalResult.replyMode).toBe('tool_only')
    expect(finalResult.finalText).toContain('公开资料')
    expect(finalResult.toolContext).toContain('example.com')
  })

  it('uses decision model to repair invalid final output instead of keyword fallback', async () => {
    const fetchUrl = vi.fn()
    const apply = vi.fn()
    const responsesCreate = vi.fn().mockResolvedValueOnce(createResponse({
      outputText: '可以，我支持联网搜索和网页抓取。',
    }))
    const toolAvailabilityInvoke = vi.fn().mockResolvedValueOnce({
      content: '{"availableTools":["web_search","web_fetch","snippet_edit"],"reason":"保留默认工具集合。"}',
    })
    const decisionInvoke = vi.fn().mockResolvedValueOnce({
      content: '{"replyMode":"tool_only","reason":"将原始文本整理为最终答复","assistantText":"可以，我支持联网搜索和网页抓取。"}',
    })

    const loop = new NativeToolLoop({
      webFetch: { fetchUrl } as any,
      snippetEdit: { apply } as any,
      responsesClientFactory: () => ({
        responses: { create: responsesCreate },
      }),
      toolAvailabilityModelFactory: () => ({ invoke: toolAvailabilityInvoke }),
      decisionModelFactory: () => ({ invoke: decisionInvoke }),
    })

    let finalResult: any
    for await (const event of loop.run({
      userInput: '你能联网搜索吗',
      localCapabilityCatalog: '<available_packages><package>tianditu-jsapi</package></available_packages>',
      mode: 'generate',
    })) {
      if (event.type === 'final') finalResult = event.result
    }

    expect(decisionInvoke).toHaveBeenCalledTimes(1)
    expect(finalResult.replyMode).toBe('tool_only')
    expect(finalResult.finalText).toContain('联网搜索')
    expect(finalResult.fallbackReason).toContain('决策整理器')
  })

  it('executes model-requested function tools and carries context into continue mode', async () => {
    const fetchUrl = vi.fn(async ({ url }: { url: string }) => ({
      url,
      finalUrl: url,
      status: 200,
      contentType: 'text/html',
      title: 'TMapGL Marker Example',
      excerpt: 'Marker example from public docs.',
    }))
    const apply = vi.fn()
    const responsesCreate = vi.fn()
      .mockResolvedValueOnce(createResponse({
        id: 'resp-1',
        output: [
          {
            type: 'function_call',
            id: 'fn-item-1',
            call_id: 'call-fetch-1',
            name: 'web_fetch',
            arguments: JSON.stringify({
              url: 'https://example.com/marker',
              reason: '读取 marker 示例',
            }),
          },
        ],
      }))
      .mockResolvedValueOnce(createResponse({
        id: 'resp-2',
        outputText: '{"replyMode":"continue","reason":"需要继续生成地图页面","assistantText":""}',
      }))
    const toolAvailabilityInvoke = vi.fn().mockResolvedValueOnce({
      content: '{"availableTools":["web_fetch","snippet_edit"],"reason":"本地能力已覆盖标准地图初始化，本轮不暴露 web_search。"}',
    })

    const loop = new NativeToolLoop({
      webFetch: { fetchUrl } as any,
      snippetEdit: { apply } as any,
      responsesClientFactory: () => ({
        responses: { create: responsesCreate },
      }),
      toolAvailabilityModelFactory: () => ({ invoke: toolAvailabilityInvoke }),
    })

    let finalResult: any
    for await (const event of loop.run({
      userInput: '帮我做一个带点位标注的地图页面',
      localCapabilityCatalog: '<available_packages><package>tianditu-jsapi: 地图本体、渲染、图层、控件、事件、覆盖物</package></available_packages>',
      mode: 'generate',
    })) {
      if (event.type === 'final') finalResult = event.result
    }

    expect(fetchUrl).toHaveBeenCalledTimes(1)
    expect(finalResult.replyMode).toBe('continue')
    expect(finalResult.toolContext).toContain('TMapGL Marker Example')
    expect(finalResult.reason).toContain('继续')

    const secondRequest = responsesCreate.mock.calls[1]?.[0] as Record<string, unknown>
    expect(secondRequest.previous_response_id).toBe('resp-1')
    expect(Array.isArray(secondRequest.input)).toBe(true)
  })

  it('uses the tool availability planner to hide web_search for standard local map tasks', async () => {
    const fetchUrl = vi.fn()
    const apply = vi.fn()
    const responsesCreate = vi.fn().mockResolvedValueOnce(createResponse({
      outputText: '{"replyMode":"continue","reason":"本地能力足以支持基础地图初始化","assistantText":""}',
    }))
    const toolAvailabilityInvoke = vi.fn().mockResolvedValueOnce({
      content: '{"availableTools":["web_fetch","snippet_edit"],"reason":"本地 tianditu-jsapi 能力已覆盖基础地图初始化。"}',
    })

    const loop = new NativeToolLoop({
      webFetch: { fetchUrl } as any,
      snippetEdit: { apply } as any,
      responsesClientFactory: () => ({
        responses: { create: responsesCreate },
      }),
      toolAvailabilityModelFactory: () => ({ invoke: toolAvailabilityInvoke }),
    })

    let finalResult: any
    for await (const event of loop.run({
      userInput: '创建一个北京的基础地图',
      localCapabilityCatalog: '<available_packages><package>tianditu-jsapi: 地图本体、渲染、图层、控件、事件、覆盖物</package></available_packages>',
      mode: 'generate',
    })) {
      if (event.type === 'final') finalResult = event.result
    }

    const firstRequest = responsesCreate.mock.calls[0]?.[0] as Record<string, any>
    expect(firstRequest.tools.some((tool: Record<string, unknown>) => tool.type === 'web_search')).toBe(false)
    expect(finalResult.replyMode).toBe('continue')
    expect(finalResult.reason).toContain('本地能力')
  })
})
