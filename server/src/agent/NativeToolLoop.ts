import {
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from '@langchain/core/messages'
import { config } from '../config.js'
import { createLLM } from '../llm/createLLM.js'
import { createResponsesClient } from '../llm/createResponsesClient.js'
import type {
  AgentToolPlan,
  DecisionSource,
  WebSearchToolStep,
  WebFetchToolStep,
  SnippetEditToolStep,
} from './AgentRuntimeTypes.js'
import {
  buildToolContext,
  buildToolOnlySummary,
  type ToolExecutionRecord,
} from './AgentTooling.js'
import { extractTextContent, parseJsonObject } from './PlannerJson.js'
import type { WebFetchService } from './WebFetchService.js'
import type { WorkspaceSnippetEditService } from './WorkspaceSnippetEditService.js'

type DecisionModel = {
  invoke(messages: BaseMessage[]): Promise<{ content: unknown }>
}

type ResponsesClientLike = {
  responses: {
    create(request: Record<string, unknown>): Promise<ResponseApiResult>
  }
}

type ResponseApiResult = {
  id?: string
  output?: Array<Record<string, unknown>>
  output_text?: string
}

interface FunctionToolCall {
  id: string
  callId: string
  name: 'web_fetch' | 'snippet_edit'
  step?: WebFetchToolStep | SnippetEditToolStep
  invalidReason?: string
  rawArgs: Record<string, unknown>
}

interface BuiltinWebSearchCall {
  id: string
  query: string
  result: {
    provider: string
    query: string
    results: Array<{
      title: string
      url: string
      snippet: string
    }>
  }
}

export interface NativeToolLoopRunParams {
  userInput: string
  conversationHistory?: string
  existingCode?: string
  fileData?: string
  localCapabilityCatalog?: string
  mode: 'generate' | 'fix'
}

export interface NativeToolLoopResult {
  replyMode: 'continue' | 'tool_only'
  reason: string
  finalText: string
  rawFinalText: string
  toolContext: string
  records: ToolExecutionRecord[]
  rounds: number
  decisionSource: DecisionSource
  fallbackReason?: string
}

export type NativeToolLoopEvent =
  | {
    type: 'tool_start'
    toolCallId: string
    toolName: string
    args: unknown
  }
  | {
    type: 'tool_end'
    toolCallId: string
    toolName: string
    args: unknown
    result: unknown
    isError: boolean
    record?: ToolExecutionRecord
  }
  | {
    type: 'final'
    result: NativeToolLoopResult
  }

export class NativeToolLoop {
  constructor(
    private deps: {
      webFetch: WebFetchService
      snippetEdit: WorkspaceSnippetEditService
      responsesClientFactory?: () => ResponsesClientLike
      toolAvailabilityModelFactory?: () => DecisionModel
      decisionModelFactory?: () => DecisionModel
    },
  ) {}

  async *run(params: NativeToolLoopRunParams): AsyncGenerator<NativeToolLoopEvent> {
    const records: ToolExecutionRecord[] = []
    const fastPathDecision = getFastPathDecision(params)
    if (fastPathDecision) {
      yield {
        type: 'final',
        result: {
          replyMode: fastPathDecision.replyMode,
          reason: fastPathDecision.reason,
          finalText: '',
          rawFinalText: '',
          toolContext: '',
          records,
          rounds: 0,
          decisionSource: 'fallback',
          fallbackReason: fastPathDecision.fallbackReason,
        },
      }
      return
    }

    const client = this.createResponsesClient()
    const toolAvailability = await this.planAvailableTools(params)
    const tools = buildResponsesToolDefinitions(toolAvailability.availableTools)
    const maxRounds = Math.max(4, config.agentTools.maxPlanSteps + 4)
    const maxOutputTokens = Math.min(config.llm.maxOutputTokens, 1800)

    let rounds = 0
    let previousResponseId: string | undefined
    let currentInput: unknown = buildResponsesInitialInput(params)

    while (rounds < maxRounds) {
      rounds += 1

      const response = await client.responses.create({
        model: config.llm.model,
        input: currentInput,
        ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
        tools,
        tool_choice: 'auto',
        max_output_tokens: maxOutputTokens,
      })

      const responseId = typeof response.id === 'string' && response.id.trim()
        ? response.id.trim()
        : undefined
      if (responseId) {
        previousResponseId = responseId
      }

      const outputItems = Array.isArray(response.output) ? response.output : []
      const builtinSearchCalls = normalizeBuiltinWebSearchCalls(outputItems)
      for (const call of builtinSearchCalls) {
        const record = toBuiltinSearchRecord(call)
        records.push(record)

        yield {
          type: 'tool_start',
          toolCallId: call.id,
          toolName: 'web_search.search',
          args: {
            tool: 'web_search',
            query: call.query,
            provider: call.result.provider,
          },
        }
        yield {
          type: 'tool_end',
          toolCallId: call.id,
          toolName: 'web_search.search',
          args: {
            tool: 'web_search',
            query: call.query,
            provider: call.result.provider,
          },
          result: call.result,
          isError: false,
          record,
        }
      }

      const functionCalls = normalizeResponseFunctionCalls(outputItems)
      if (functionCalls.length > 0) {
        const functionOutputs: Array<Record<string, unknown>> = []

        for (const call of functionCalls) {
          yield {
            type: 'tool_start',
            toolCallId: call.callId,
            toolName: mapToolEventName(call.name),
            args: call.step ?? call.rawArgs,
          }

          const execution = call.invalidReason
            ? {
              result: `工具参数无效: ${call.invalidReason}`,
              isError: true,
              record: undefined,
            }
            : await this.executeToolStep(call.step as WebFetchToolStep | SnippetEditToolStep)

          if (execution.record) {
            records.push(execution.record)
          }

          yield {
            type: 'tool_end',
            toolCallId: call.callId,
            toolName: mapToolEventName(call.name),
            args: call.step ?? call.rawArgs,
            result: execution.result,
            isError: execution.isError,
            record: execution.record,
          }

          functionOutputs.push({
            type: 'function_call_output',
            call_id: call.callId,
            output: formatFunctionOutputForResponses(execution.result, execution.isError),
          })
        }

        currentInput = functionOutputs
        continue
      }

      const rawFinalText = extractResponseOutputText(response, outputItems).trim()
      const decision = await this.parseFinalDecision(rawFinalText, params, records)
      const planLike = {
        action: records.length > 0 ? 'run_tools' : 'skip',
        replyMode: decision.replyMode,
        reason: decision.reason,
        confidence: decision.decisionSource === 'llm' ? 0.84 : 0.58,
        steps: records.map((record) => record.step),
        raw: rawFinalText,
        decisionSource: decision.decisionSource,
        fallbackReason: decision.fallbackReason,
      } as const
      const finalText = decision.replyMode === 'tool_only'
        ? (decision.assistantText || buildToolOnlySummary(planLike, records)).trim()
        : ''

      yield {
        type: 'final',
        result: {
          replyMode: decision.replyMode,
          reason: decision.reason,
          finalText,
          rawFinalText,
          toolContext: buildToolContext(records),
          records,
          rounds,
          decisionSource: decision.decisionSource,
          fallbackReason: decision.fallbackReason,
        },
      }
      return
    }

    const fallbackDecision = await this.parseFinalDecision(
      '',
      params,
      records,
      'native_tool_loop 达到最大轮次，请直接基于现有上下文给出最终 JSON 决策。',
    )
    const fallbackPlan: AgentToolPlan = {
      action: records.length > 0 ? 'run_tools' : 'skip',
      replyMode: fallbackDecision.replyMode,
      reason: fallbackDecision.reason,
      confidence: fallbackDecision.decisionSource === 'llm' ? 0.7 : 0.4,
      steps: records.map((record) => record.step),
      raw: '',
      decisionSource: fallbackDecision.decisionSource,
      fallbackReason: fallbackDecision.fallbackReason,
    }

    yield {
      type: 'final',
      result: {
        replyMode: fallbackDecision.replyMode,
        reason: fallbackDecision.reason,
        finalText: fallbackDecision.replyMode === 'tool_only'
          ? (fallbackDecision.assistantText || buildToolOnlySummary(fallbackPlan, records))
          : '',
        rawFinalText: '',
        toolContext: buildToolContext(records),
        records,
        rounds,
        decisionSource: fallbackDecision.decisionSource,
        fallbackReason: fallbackDecision.fallbackReason,
      },
    }
  }

  private createResponsesClient(): ResponsesClientLike {
    if (this.deps.responsesClientFactory) {
      return this.deps.responsesClientFactory()
    }
    return createResponsesClient() as unknown as ResponsesClientLike
  }

  private createDecisionModel(): DecisionModel {
    if (this.deps.decisionModelFactory) {
      return this.deps.decisionModelFactory()
    }
    return createLLM({
      temperature: 0,
      maxTokens: 500,
      modelName: config.llm.nativeToolLoopAuxModel,
    }) as DecisionModel
  }

  private createToolAvailabilityModel(): DecisionModel {
    if (this.deps.toolAvailabilityModelFactory) {
      return this.deps.toolAvailabilityModelFactory()
    }
    return createLLM({
      temperature: 0,
      maxTokens: 300,
      modelName: config.llm.nativeToolLoopAuxModel,
    }) as DecisionModel
  }

  private async planAvailableTools(params: NativeToolLoopRunParams): Promise<{
    availableTools: Array<'web_search' | 'web_fetch' | 'snippet_edit'>
    decisionSource: DecisionSource
    reason: string
  }> {
    if (shouldHideWebSearchForLocalTiandituTask(params)) {
      return {
        availableTools: ['web_fetch', 'snippet_edit'],
        decisionSource: 'fallback',
        reason: '当前请求属于本地已覆盖的天地图地图 / LBS 任务，优先禁用 web_search，避免无意义联网搜索拖慢首包。',
      }
    }

    if (!params.localCapabilityCatalog?.trim()) {
      return {
        availableTools: ['web_search', 'web_fetch', 'snippet_edit'],
        decisionSource: 'fallback',
        reason: '缺少本地能力目录，默认暴露全部工具。',
      }
    }

    const model = this.createToolAvailabilityModel()
    const response = await model.invoke([
      new SystemMessage([
        '你是 native tool loop 的工具暴露规划器。',
        '你的任务是在进入工具循环前，结合当前请求与本地能力目录，决定本轮应该向主模型暴露哪些工具。',
        '只输出 JSON，不要输出 Markdown。',
        'JSON 格式：{"availableTools":["web_search","web_fetch","snippet_edit"],"reason":"..."}',
        '规则：',
        '- 如果当前请求是标准的天地图本地能力范围内任务，比如基础地图初始化、设置中心点、缩放级别、覆盖物、图层、控件、常规 LBS 调用，不要暴露 web_search。',
        '- 只有当请求需要外部最新事实、新闻、公开资料、开源实现、或者本地能力目录不足以支持完成任务时，才暴露 web_search。',
        '- web_fetch 和 snippet_edit 默认可以保留，除非明显完全不需要。',
        '- 这是工具可见性规划，不是最终答复。你的目标是减少不必要的联网搜索。',
      ].join('\n')),
      new HumanMessage([
        '## 当前请求',
        params.userInput || '',
        params.conversationHistory ? `\n## 对话历史\n${params.conversationHistory.slice(-1200)}` : '',
        params.existingCode ? '\n## 已有代码\n存在已有代码。' : '',
        params.fileData ? '\n## 文件上下文\n存在文件上下文。' : '',
        '\n## 本地能力目录',
        params.localCapabilityCatalog.slice(0, 5000),
      ].filter(Boolean).join('\n')),
    ])

    const raw = extractTextContent(response.content).trim()
    const parsed = parseJsonObject(raw, {
      availableTools: ['web_search', 'web_fetch', 'snippet_edit'],
      reason: '',
    })

    const requestedTools = Array.isArray(parsed.availableTools)
      ? parsed.availableTools
        .map(String)
        .map((item) => item.trim())
        .filter((item): item is 'web_search' | 'web_fetch' | 'snippet_edit' =>
          item === 'web_search' || item === 'web_fetch' || item === 'snippet_edit')
      : []
    const availableTools = dedupeToolNames(requestedTools)

    if (availableTools.length > 0) {
      return {
        availableTools,
        decisionSource: 'llm',
        reason: typeof parsed.reason === 'string' ? parsed.reason.trim() : '',
      }
    }

    return {
      availableTools: ['web_search', 'web_fetch', 'snippet_edit'],
      decisionSource: 'fallback',
      reason: '工具暴露规划器未返回有效工具集合，默认暴露全部工具。',
    }
  }

  private async executeToolStep(step: WebFetchToolStep | SnippetEditToolStep): Promise<{
    result: unknown
    isError: boolean
    record?: ToolExecutionRecord
  }> {
    try {
      let result: unknown

      if (step.tool === 'web_fetch') {
        result = await this.deps.webFetch.fetchUrl({ url: step.url })
      } else {
        result = await this.deps.snippetEdit.apply({
          filePath: step.filePath,
          oldString: step.oldString,
          newString: step.newString,
          expectedOccurrences: step.expectedOccurrences,
          occurrenceIndex: step.occurrenceIndex,
        })
      }

      return {
        result,
        isError: false,
        record: { step, result, isError: false },
      }
    } catch (error) {
      return {
        result: error instanceof Error ? error.message : String(error),
        isError: true,
      }
    }
  }

  private async parseFinalDecision(
    raw: string,
    params: NativeToolLoopRunParams,
    records: ToolExecutionRecord[],
    overrideInstruction?: string,
  ): Promise<{
    replyMode: 'continue' | 'tool_only'
    reason: string
    assistantText: string
    decisionSource: DecisionSource
    fallbackReason?: string
  }> {
    const direct = parseDecisionJson(raw)
    if (direct) {
      return applyDecisionGuards({
        ...direct,
        decisionSource: 'llm',
      }, params)
    }

    const decisionModel = this.createDecisionModel()
    const toolContext = buildToolContext(records)
    const response = await decisionModel.invoke([
      new SystemMessage([
        '你是 native tool loop 的最终决策整理器。',
        '你的唯一任务是根据用户请求、对话历史、已有工具结果、以及模型刚才的原始输出，输出一个严格 JSON 对象。',
        '不要调用工具，不要输出 Markdown。',
        'JSON 格式：{"replyMode":"continue|tool_only","reason":"...","assistantText":"..."}',
        '如果用户是在询问能力、权限、是否支持某工具，replyMode=tool_only，并直接回答能力说明。',
        '如果用户是在对上一轮回答做短追问或要求澄清，replyMode=tool_only，并基于对话历史直接解释。',
        '如果用户是在要求解读、分析、统计、概括已上传文件的具体内容，replyMode=continue，让下游主链路基于完整文件上下文回答。',
        '如果用户的真实目标是继续生成/修改代码或页面，replyMode=continue。',
        '只有在 tool_only 时 assistantText 才应写给用户；continue 时 assistantText 置空。',
      ].join('\n')),
      new HumanMessage([
        overrideInstruction || '请把下面上下文整理成最终 JSON 决策。',
        '',
        '## 当前请求',
        params.userInput || '',
        params.conversationHistory ? `\n## 对话历史\n${params.conversationHistory.slice(-1600)}` : '',
        params.existingCode ? '\n## 当前已有代码\n存在已有代码。' : '',
        params.fileData ? `\n## 文件上下文摘要\n${buildFileDataDigest(params.fileData)}` : '',
        raw ? `\n## 模型原始输出\n${raw}` : '',
        toolContext ? `\n${toolContext}` : '',
      ].filter(Boolean).join('\n')),
    ])

    const repaired = parseDecisionJson(extractTextContent(response.content).trim())
    if (repaired) {
      return applyDecisionGuards({
        ...repaired,
        decisionSource: 'llm',
        fallbackReason: raw
          ? '模型首次输出未遵循 JSON 协议，已通过决策整理器修复。'
          : '模型未产出最终文本，已通过决策整理器补全最终决策。',
      }, params)
    }

    return applyDecisionGuards({
      replyMode: params.mode === 'fix' ? 'continue' : 'tool_only',
      reason: '模型未返回可解析的最终决策，使用安全回退。',
      assistantText: params.mode === 'fix' ? '' : (raw || '我需要你再具体说明一下你的目标，我再继续处理。'),
      decisionSource: 'fallback',
      fallbackReason: 'decision_model_parse_failed',
    }, params)
  }
}

function buildResponsesToolDefinitions(availableTools: Array<'web_search' | 'web_fetch' | 'snippet_edit'>) {
  const tools: Array<Record<string, unknown>> = []

  if (availableTools.includes('web_search')) {
    tools.push({ type: 'web_search' })
  }

  if (availableTools.includes('web_fetch')) {
    tools.push({
      type: 'function',
      name: 'web_fetch',
      description: '抓取某个明确 URL 的正文摘要。只有当你已经确定具体页面 URL，且需要读取正文内容、标题或关键段落时才使用。',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '要抓取的公开网页 URL。必须是 http/https。' },
          reason: { type: 'string', description: '为什么需要读取这个页面。' },
        },
        required: ['url'],
      },
    })
  }

  if (availableTools.includes('snippet_edit')) {
    tools.push({
      type: 'function',
      name: 'snippet_edit',
      description: '对当前工作区文件做精确 search/replace 片段替换。仅在用户明确要求修改工程文件，且你能给出精确 oldString/newString 时使用。',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: '相对工作区根目录的文件路径。' },
          oldString: { type: 'string', description: '要被替换的原始精确片段。' },
          newString: { type: 'string', description: '替换后的新片段。' },
          expectedOccurrences: {
            type: 'integer',
            description: '期望命中次数；如果你确定只应命中 1 次，请显式传 1。',
            minimum: 1,
          },
          occurrenceIndex: {
            type: 'integer',
            description: '命中多次时要替换第几个，0 表示第一个。',
            minimum: 0,
          },
          reason: { type: 'string', description: '为什么要做这次修改。' },
        },
        required: ['filePath', 'oldString', 'newString'],
      },
    })
  }

  return tools
}

function buildSystemPrompt(params: NativeToolLoopRunParams): string {
  return [
    '你是天地图智能体的原生工具循环（native tool loop）。',
    '你运行在 qwen3.5-plus 上，支持原生联网搜索（web_search）以及自定义函数工具。',
    '不要假装“无法联网”或“没有搜索能力”。',
    '如果系统已经提供本地能力目录，请优先依赖这些本地能力完成标准天地图任务；只有本地能力明显不够时才考虑联网。',
    '',
    '可用工具：',
    '- web_search：原生联网搜索，用来查最新网页、新闻、官方资料、开源实现。',
    '- web_fetch：本地函数工具，用来读取某个明确 URL 的正文摘要。',
    '- snippet_edit：本地函数工具，用来精确修改工作区文件片段。',
    '',
    '你的任务分三步：',
    '1. 先理解用户到底是在询问能力，还是要求你实际完成任务。',
    '2. 再决定是否需要调用工具，以及需要调用哪个工具。',
    '3. 当你认为工具阶段完成后，只输出一个 JSON 对象，不要输出 Markdown，不要输出额外解释。',
    '',
    '最终 JSON 格式：',
    '{"replyMode":"continue|tool_only","reason":"...","assistantText":"..."}',
    '',
    '决策规则：',
    '- 如果用户是在询问你的能力、权限、是否支持某工具，直接 tool_only 回答，禁止为了证明能力而调用工具。',
    '- 如果用户是在追问上一轮回答的含义，优先基于对话历史做澄清，通常不需要调用工具。',
    '- 如果用户是在要求解读、分析、统计、概括已上传文件的具体内容，不要只做泛泛确认，默认 replyMode=continue，让下游主链路基于完整文件上下文回答。',
    '- 如果用户需要外部最新事实、新闻、官方资料、开源实现，优先使用 web_search。',
    '- 如果 web_search 已定位到候选来源，但你还需要更精确的页面正文，请继续调用 web_fetch 读取具体 URL。',
    '- 只有当用户明确要求修改工程文件，并且你已经掌握精确 oldString/newString 时，才调用 snippet_edit。',
    '- 若当前阶段已经足够直接回答用户，replyMode=tool_only。',
    '- 若真实目标是继续生成地图页面、修改地图代码、进入下游生成链路，replyMode=continue。',
    '- 非工具最终回复时，不要声称“知识截止导致不能查实时信息”。',
    '',
    `当前阶段: ${params.mode}`,
  ].join('\n')
}

function buildUserPrompt(params: NativeToolLoopRunParams): string {
  return [
    '## 当前请求',
    params.userInput || '',
    params.conversationHistory ? `\n## 对话历史\n${params.conversationHistory.slice(-1600)}` : '',
    params.existingCode ? '\n## 当前已有代码\n存在已有代码，需要按需继续修改或继续生成。' : '',
    params.fileData ? `\n## 文件上下文摘要\n${buildFileDataDigest(params.fileData)}` : '',
    params.localCapabilityCatalog ? `\n## 本地能力目录\n${params.localCapabilityCatalog.slice(0, 5000)}` : '',
    '\n## 额外要求',
    '- 如果你决定进入下游代码生成链路，assistantText 可以留空，但 reason 必须说明为什么继续。',
    '- 如果你决定 tool_only，assistantText 必须是用户可直接看到的中文答复。',
    '- 若你通过 web_search 找到来源，但这些来源会影响下游代码生成，请优先继续调用 web_fetch 读取最关键的页面内容。',
  ].filter(Boolean).join('\n')
}

function buildResponsesInitialInput(params: NativeToolLoopRunParams): Array<Record<string, unknown>> {
  return [
    {
      role: 'system',
      content: buildSystemPrompt(params),
    },
    {
      role: 'user',
      content: buildUserPrompt(params),
    },
  ]
}

function buildFileDataDigest(fileData?: string): string {
  if (!fileData?.trim()) return '存在文件上下文。'

  const lines = fileData
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const importantPatterns = [
    /^文件:/,
    /^文件获取链接URL:/,
    /^- 数据读取状态:/,
    /^- 根结构:/,
    /^- 要素数量:/,
    /^- 几何类型统计:/,
    /^- 数据范围:/,
    /^- 字段数量:/,
    /^- 推荐可视化:/,
    /^- 推荐分组\/分色字段:/,
    /^- 推荐权重\/强度字段:/,
    /^- 安全坐标提取:/,
    /^- 顶层 key:/,
    /^- 根数组长度:/,
    /^- 坐标识别:/,
    /^- 访问示例:/,
    /^- 原始文件结构说明:/,
  ]

  const selected: string[] = []
  const seen = new Set<string>()
  const pushLine = (line: string) => {
    if (!line || seen.has(line)) return
    selected.push(line)
    seen.add(line)
  }

  for (const line of lines) {
    if (importantPatterns.some((pattern) => pattern.test(line))) {
      pushLine(line)
    }
    if (selected.length >= 12) break
  }

  if (selected.length === 0) {
    for (const line of lines) {
      if (/^```/.test(line) || /^[{\[]$/.test(line)) continue
      pushLine(line)
      if (selected.length >= 8) break
    }
  }

  return selected.join('\n') || '存在文件上下文。'
}

function shouldContinueForFileInterpretation(params: NativeToolLoopRunParams): boolean {
  if (params.mode !== 'generate') return false
  if (!params.fileData?.trim()) return false

  const text = String(params.userInput || '').trim()
  if (!text) return false

  const visibilityOnlyPattern = /(能看见|看到了吗|看到吗|收到(了|吗)?|接收到|上传成功|能打开|能预览)/i
  const analysisPattern = /(解读|分析|解析|总结|概括|说明|解释|介绍|看一下|看下|看看|读一下|梳理|识别|统计|字段|结构|记录|条数|多少条|多少个|有哪些|有什么|包含|内容|特征|分布|概览)/i

  if (visibilityOnlyPattern.test(text) && !analysisPattern.test(text)) {
    return false
  }

  return analysisPattern.test(text)
}

function applyDecisionGuards(
  decision: {
    replyMode: 'continue' | 'tool_only'
    reason: string
    assistantText: string
    decisionSource: DecisionSource
    fallbackReason?: string
  },
  params: NativeToolLoopRunParams,
): {
  replyMode: 'continue' | 'tool_only'
  reason: string
  assistantText: string
  decisionSource: DecisionSource
  fallbackReason?: string
} {
  if (decision.replyMode === 'tool_only' && shouldContinueForFileInterpretation(params)) {
    return {
      replyMode: 'continue',
      reason: '用户正在请求解读已上传数据，需要进入主链路基于完整文件上下文回答。',
      assistantText: '',
      decisionSource: 'fallback',
      fallbackReason: 'file_interpretation_requires_full_file_context',
    }
  }

  return decision
}

function shouldHideWebSearchForLocalTiandituTask(params: NativeToolLoopRunParams): boolean {
  if (params.mode !== 'generate') return false
  if (!params.userInput?.trim()) return false

  const text = `${params.userInput}\n${params.conversationHistory || ''}`.toLowerCase()

  if (/(最新|最近|新闻|github|开源|官方资料|官网|联网|搜索一下|查一下|web search|论文|文献)/i.test(text)) {
    return false
  }

  return /(天地图|tmapgl|\/api\/tianditu\/|公交|地铁|换乘|路线规划|路径规划|busline|transit|drive|geocode|poi|行政区|热力图|聚合|geojson|图层|marker|popup|起点|终点|左侧控制面板|右侧地图)/i.test(text)
}

function getFastPathDecision(params: NativeToolLoopRunParams): {
  replyMode: 'continue'
  reason: string
  fallbackReason: string
} | null {
  if (shouldFastPathContinueForLocalTiandituGeneration(params)) {
    return {
      replyMode: 'continue',
      reason: '当前请求是明确的天地图页面 / 代码生成任务，且本地能力已覆盖所需地图与 LBS 能力，直接进入主链路生成可减少首包等待。',
      fallbackReason: 'local_tianditu_generation_fast_path',
    }
  }

  return null
}

function shouldFastPathContinueForLocalTiandituGeneration(params: NativeToolLoopRunParams): boolean {
  if (params.mode !== 'generate') return false
  if (!params.userInput?.trim()) return false
  if (!shouldHideWebSearchForLocalTiandituTask(params)) return false

  const text = `${params.userInput}\n${params.conversationHistory || ''}`.toLowerCase()
  if (/(你能|是否|支持吗|是什么|什么意思|怎么回事|为什么|能不能|可不可以)/i.test(text)) {
    return false
  }

  return /(生成|创建|实现|开发|编写|搭建|做一个|做个|页面|网页|组件|界面|demo|示例|代码)/i.test(text)
}

function parseDecisionJson(raw: string): {
  replyMode: 'continue' | 'tool_only'
  reason: string
  assistantText: string
} | null {
  const parsed = parseJsonObject(raw, {
    replyMode: 'tool_only',
    reason: '',
    assistantText: raw,
  })
  if (parsed.__parseFailed === true) return null

  const replyMode = String(parsed.replyMode || '').toLowerCase() === 'continue'
    ? 'continue'
    : 'tool_only'
  const reason = typeof parsed.reason === 'string' && parsed.reason.trim()
    ? parsed.reason.trim()
    : (replyMode === 'continue' ? '需要继续进入下游生成链路。' : '当前阶段已足够直接回答。')
  const assistantText = typeof parsed.assistantText === 'string'
    ? parsed.assistantText.trim()
    : ''

  return {
    replyMode,
    reason,
    assistantText: replyMode === 'tool_only' ? assistantText : '',
  }
}

function normalizeBuiltinWebSearchCalls(output: unknown): BuiltinWebSearchCall[] {
  if (!Array.isArray(output)) return []

  const calls: BuiltinWebSearchCall[] = []
  for (let index = 0; index < output.length; index += 1) {
    const item = output[index]
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    if (String(record.type || '').trim() !== 'web_search_call') continue

    const action = record.action && typeof record.action === 'object'
      ? record.action as Record<string, unknown>
      : {}
    const query = typeof action.query === 'string' && action.query.trim()
      ? action.query.trim()
      : 'web_search'
    const sources = Array.isArray(action.sources) ? action.sources : []
    const results = dedupeSearchResultsByUrl(
      sources
        .map((source, sourceIndex) => {
          if (!source || typeof source !== 'object') return null
          const item = source as Record<string, unknown>
          const url = typeof item.url === 'string' ? item.url.trim() : ''
          if (!url) return null
          const sourceType = typeof item.type === 'string' && item.type.trim()
            ? item.type.trim()
            : 'url'
          return {
            title: deriveSourceTitle(url, sourceIndex),
            url,
            snippet: `模型原生联网搜索来源（${sourceType}）`,
          }
        })
        .filter((value): value is { title: string; url: string; snippet: string } => Boolean(value)),
    )

    calls.push({
      id: typeof record.id === 'string' && record.id.trim()
        ? record.id.trim()
        : `web-search-call-${Date.now()}-${index + 1}`,
      query,
      result: {
        provider: 'qwen_builtin_web_search',
        query,
        results,
      },
    })
  }

  return calls
}

function toBuiltinSearchRecord(call: BuiltinWebSearchCall): ToolExecutionRecord {
  const step: WebSearchToolStep = {
    tool: 'web_search',
    reason: '模型原生联网搜索',
    query: call.query,
    maxResults: call.result.results.length || undefined,
  }

  return {
    step,
    result: call.result,
    isError: false,
  }
}

function normalizeResponseFunctionCalls(output: unknown): FunctionToolCall[] {
  if (!Array.isArray(output)) return []

  const normalized: FunctionToolCall[] = []
  for (let index = 0; index < output.length; index += 1) {
    const item = output[index]
    if (!item || typeof item !== 'object') continue
    const call = item as Record<string, unknown>
    if (String(call.type || '').trim() !== 'function_call') continue

    const name = String(call.name || '').trim().toLowerCase()
    const id = typeof call.id === 'string' && call.id.trim()
      ? call.id.trim()
      : `function-call-item-${Date.now()}-${index + 1}`
    const callId = typeof call.call_id === 'string' && call.call_id.trim()
      ? call.call_id.trim()
      : id
    const rawArgs = parseFunctionCallArguments(call.arguments)

    if (name === 'web_fetch') {
      const url = typeof rawArgs.url === 'string' ? rawArgs.url.trim() : ''
      normalized.push({
        id,
        callId,
        name: 'web_fetch',
        rawArgs,
        step: url
          ? {
            tool: 'web_fetch',
            reason: typeof rawArgs.reason === 'string' ? rawArgs.reason.trim() : '',
            url,
          }
          : undefined,
        invalidReason: url ? undefined : '缺少 url',
      })
      continue
    }

    if (name === 'snippet_edit') {
      const filePath = typeof rawArgs.filePath === 'string' ? rawArgs.filePath.trim() : ''
      const oldString = typeof rawArgs.oldString === 'string' ? rawArgs.oldString : ''
      const newString = typeof rawArgs.newString === 'string' ? rawArgs.newString : ''

      normalized.push({
        id,
        callId,
        name: 'snippet_edit',
        rawArgs,
        step: filePath && oldString && oldString !== newString
          ? {
            tool: 'snippet_edit',
            reason: typeof rawArgs.reason === 'string' ? rawArgs.reason.trim() : '',
            filePath,
            oldString,
            newString,
            expectedOccurrences: normalizePositiveInt(rawArgs.expectedOccurrences),
            occurrenceIndex: normalizeZeroBasedInt(rawArgs.occurrenceIndex),
          }
          : undefined,
        invalidReason: filePath && oldString && oldString !== newString
          ? undefined
          : '缺少 filePath / oldString / newString，或 oldString 与 newString 相同',
      })
    }
  }

  return normalized
}

function parseFunctionCallArguments(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') {
    return value as Record<string, unknown>
  }

  if (typeof value !== 'string' || !value.trim()) {
    return {}
  }

  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function formatFunctionOutputForResponses(result: unknown, isError: boolean): string {
  const payload = isError
    ? { ok: false, error: typeof result === 'string' ? result : JSON.stringify(result) }
    : result
  const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)
  return serialized.length <= 12000 ? serialized : `${serialized.slice(0, 12000)}...`
}

function extractResponseOutputText(response: ResponseApiResult, outputItems: Array<Record<string, unknown>>): string {
  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text
  }

  const chunks: string[] = []
  for (const item of outputItems) {
    if (String(item.type || '').trim() !== 'message') continue
    const content = Array.isArray(item.content) ? item.content : []
    for (const part of content) {
      if (!part || typeof part !== 'object') continue
      const entry = part as Record<string, unknown>
      if (String(entry.type || '').trim() !== 'output_text') continue
      const text = typeof entry.text === 'string' ? entry.text : ''
      if (text) chunks.push(text)
    }
  }

  return chunks.join('').trim()
}

function mapToolEventName(name: FunctionToolCall['name']): string {
  if (name === 'web_fetch') return 'web_fetch.fetch'
  return 'snippet_edit.apply'
}

function deriveSourceTitle(url: string, index: number): string {
  try {
    const { hostname } = new URL(url)
    return hostname || `来源 ${index + 1}`
  } catch {
    return `来源 ${index + 1}`
  }
}

function dedupeSearchResultsByUrl(items: Array<{ title: string; url: string; snippet: string }>) {
  const seen = new Set<string>()
  const output: Array<{ title: string; url: string; snippet: string }> = []
  for (const item of items) {
    if (!item.url || seen.has(item.url)) continue
    seen.add(item.url)
    output.push(item)
  }
  return output
}

function normalizePositiveInt(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 1) return undefined
  return Math.floor(n)
}

function normalizeZeroBasedInt(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 0) return undefined
  return Math.floor(n)
}

function dedupeToolNames(items: Array<'web_search' | 'web_fetch' | 'snippet_edit'>) {
  return Array.from(new Set(items))
}
