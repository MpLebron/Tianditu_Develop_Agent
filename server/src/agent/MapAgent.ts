import { StateGraph, Annotation, END } from '@langchain/langgraph'
import { SkillStore } from './SkillStore.js'
import { SkillMatcher } from './SkillMatcher.js'
import { SkillPlanner } from './SkillPlanner.js'
import { DocLoader } from './DocLoader.js'
import { CodeGenerator } from './CodeGenerator.js'
import { analyzeGeneratedCode, formatGuardIssuesForPrompt, hasBlockingGuardIssue } from './GeneratedCodeGuard.js'
import { buildApiContractPrompt } from './TiandituApiContractAdvisor.js'
import type { LlmSelection } from '../provider/index.js'

// ========== 状态定义 ==========

const AgentState = Annotation.Root({
  userInput: Annotation<string>(),
  fileData: Annotation<string | undefined>(),
  conversationHistory: Annotation<string | undefined>(),
  existingCode: Annotation<string | undefined>(),
  matchedSkills: Annotation<string[]>(),
  loadedDocs: Annotation<string>(),
  code: Annotation<string | null>(),
  response: Annotation<string>(),
  error: Annotation<string | null>(),
})

type AgentStateType = typeof AgentState.State

type CodeStreamChunk = { type: 'text' | 'code_start' | 'code_delta' | 'code' | 'error'; content: string }
type ToolStartChunk = {
  type: 'tool_execution_start'
  toolCallId: string
  toolName: string
  args: unknown
}
type ToolEndChunk = {
  type: 'tool_execution_end'
  toolCallId: string
  toolName: string
  result: unknown
  isError: boolean
}

export type AgentStreamChunk = CodeStreamChunk | ToolStartChunk | ToolEndChunk

// ========== MapAgent 类 ==========

export class MapAgent {
  private skillStore: SkillStore
  private skillMatcher: SkillMatcher
  private skillPlanner: SkillPlanner
  private docLoader: DocLoader
  private codeGen: CodeGenerator
  private graph: any
  private initialized = false

  constructor() {
    this.skillStore = new SkillStore()
    this.skillMatcher = new SkillMatcher(this.skillStore)
    this.skillPlanner = new SkillPlanner(this.skillStore)
    this.docLoader = new DocLoader(this.skillStore)
    this.codeGen = new CodeGenerator()
  }

  async init() {
    if (this.initialized) return
    await this.skillStore.init()
    this.graph = this.buildGraph()
    this.initialized = true
    console.log('[MapAgent] 初始化完成')
  }

  /**
   * 处理用户请求（非流式）
   */
  async invoke(params: {
    userInput: string
    fileData?: string
    conversationHistory?: string
    existingCode?: string
    llmSelection?: LlmSelection
  }): Promise<{ code: string | null; response: string; error: string | null }> {
    await this.init()
    // 非流式接口复用流式主链路，避免与 invokeStream 的策略分叉（skill loop / doc loading / 生成逻辑不一致）
    let response = ''
    let code: string | null = null
    let error: string | null = null

    for await (const chunk of this.invokeStream(params)) {
      switch (chunk.type) {
        case 'text':
          response += chunk.content
          break
        case 'code':
          code = chunk.content
          break
        case 'error':
          error = chunk.content
          break
        default:
          // tool_execution_* / code_start / code_delta 对非流式返回无需聚合
          break
      }
    }

    return { code, response, error }
  }

  /**
   * 流式处理用户请求
   * LLM 自主判断是生成代码还是纯文字回复
   */
  async *invokeStream(params: {
    userInput: string
    fileData?: string
    conversationHistory?: string
    existingCode?: string
    llmSelection?: LlmSelection
  }): AsyncGenerator<AgentStreamChunk> {
    await this.init()

    let toolSeq = 0
    const nextToolCallId = (toolName: string) => `${toolName}-${Date.now()}-${++toolSeq}`
    const summarizeError = (err: unknown) => (err instanceof Error ? err.message : String(err))

    // 1. OpenClaw 风格 inner loop：模型逐轮决定是否继续读取 skill 文档（不设固定 3 个上限）
    const totalSkillCount = this.skillStore.getSkillNames().length
    const loadedSkills: string[] = []
    const loadedDocsParts: string[] = []
    let plannerStoppedByGenerate = false
    let fallbackAfterPlannerParseFailure = false
    let iteration = 0

    while (true) {
      iteration += 1
      const planCallId = nextToolCallId('skill_tool_loop.decideNextAction')
      yield {
        type: 'tool_execution_start',
        toolCallId: planCallId,
        toolName: 'skill_tool_loop.decideNextAction',
        args: {
          iteration,
          mode: 'generate',
          loadedSkills,
          loadedSkillCount: loadedSkills.length,
          totalSkillCount,
          hasConversationHistory: !!params.conversationHistory,
          hasExistingCode: !!params.existingCode,
          hasFileData: !!params.fileData,
        },
      }

      let loopDecision: {
        action: 'read_skill_docs' | 'generate'
        skillNames?: string[]
        reason: string
        source: string
        parseFailed?: boolean
      }
      try {
        const d = await this.skillPlanner.decideNextAction({
          userInput: params.userInput,
          loadedSkills,
          conversationHistory: params.conversationHistory,
          existingCode: params.existingCode,
          fileData: params.fileData,
          llmSelection: params.llmSelection,
        })
        loopDecision = {
          action: d.action,
          skillNames: d.skillNames,
          reason: d.reason,
          source: 'llm',
          parseFailed: d.parseFailed,
        }

        yield {
          type: 'tool_execution_end',
          toolCallId: planCallId,
          toolName: 'skill_tool_loop.decideNextAction',
          result: {
            ...loopDecision,
            mode: 'generate',
            parseFailed: !!loopDecision.parseFailed,
            decisionSummary:
              loopDecision.action === 'read_skill_docs'
                ? `读取 skill 文档: ${(loopDecision.skillNames || []).join(', ') || '（未提供）'}`
                : '开始生成（信息已足够）',
          },
          isError: false,
        }
      } catch (err) {
        yield {
          type: 'tool_execution_end',
          toolCallId: planCallId,
          toolName: 'skill_tool_loop.decideNextAction',
          result: summarizeError(err),
          isError: true,
        }
        break
      }

      if (loopDecision.action === 'generate') {
        if (
          loopDecision.parseFailed &&
          hasLikelyMapIntent(params.userInput, params.fileData) &&
          !loadedSkills.some((s) => isLikelyCoreMapSkillName(s))
        ) {
          fallbackAfterPlannerParseFailure = true
        }
        plannerStoppedByGenerate = true
        break
      }

      const skillNames = dedupe((loopDecision.skillNames || []).filter(Boolean))
      if (skillNames.length === 0) break

      for (const skillName of skillNames) {
        if (loadedSkills.includes(skillName)) continue

        const docsCallId = nextToolCallId('doc_loader.readSkillDoc')
        yield {
          type: 'tool_execution_start',
          toolCallId: docsCallId,
          toolName: 'doc_loader.readSkillDoc',
          args: {
            skillName,
            mode: 'generate',
            selectionReason: loopDecision.reason || undefined,
          },
        }

        try {
          const doc = await this.docLoader.loadMatchedDocs([skillName])
          if (!doc) throw new Error(`未找到 skill 文档: ${skillName}`)
          loadedSkills.push(skillName)
          loadedDocsParts.push(doc)

          yield {
            type: 'tool_execution_end',
            toolCallId: docsCallId,
            toolName: 'doc_loader.readSkillDoc',
            result: {
              mode: 'generate',
              skillName,
              totalLoadedSkills: loadedSkills.length,
              docChars: doc.length,
              docPreview: doc.slice(0, 160),
              selectionReason: loopDecision.reason || undefined,
            },
            isError: false,
          }
        } catch (err) {
          yield {
            type: 'tool_execution_end',
            toolCallId: docsCallId,
            toolName: 'doc_loader.readSkillDoc',
            result: summarizeError(err),
            isError: true,
          }
          break
        }
      }
    }

    // 仅在循环异常/中断导致未加载任何 skill 时回退；
    // 如果模型明确选择了 generate，则尊重其决策，不做额外 fallback。
    if ((loadedSkills.length === 0 && !plannerStoppedByGenerate) || fallbackAfterPlannerParseFailure) {
      const fallbackCallId = nextToolCallId('skill_planner.selectSkills')
      yield {
        type: 'tool_execution_start',
        toolCallId: fallbackCallId,
        toolName: 'skill_planner.selectSkills',
        args: {
          mode: 'generate',
          userInput: params.userInput.slice(0, 200),
          fallback: true,
          fallbackReason: fallbackAfterPlannerParseFailure ? 'planner_parse_failed' : 'no_skill_loaded',
          hasConversationHistory: !!params.conversationHistory,
          hasExistingCode: !!params.existingCode,
          hasFileData: !!params.fileData,
        },
      }

      try {
        const decision = await this.selectSkills({
          userInput: params.userInput,
          conversationHistory: params.conversationHistory,
          existingCode: params.existingCode,
          fileData: params.fileData,
          llmSelection: params.llmSelection,
        })
        const fallbackSkills = decision.selectedSkills.filter((s) => !loadedSkills.includes(s))
        for (const skillName of fallbackSkills) {
          const doc = await this.docLoader.loadMatchedDocs([skillName])
          if (doc) {
            loadedSkills.push(skillName)
            loadedDocsParts.push(doc)
          }
        }

        yield {
          type: 'tool_execution_end',
          toolCallId: fallbackCallId,
          toolName: 'skill_planner.selectSkills',
          result: {
            ...decision,
            mode: 'generate',
            plannerStoppedByGenerate,
            fallbackAfterPlannerParseFailure,
            selectedSkills: loadedSkills,
          },
          isError: false,
        }
      } catch (err) {
        yield {
          type: 'tool_execution_end',
          toolCallId: fallbackCallId,
          toolName: 'skill_planner.selectSkills',
          result: summarizeError(err),
          isError: true,
        }
      }
    }

    const matched = loadedSkills
    const docs = loadedDocsParts.join('\n\n---\n\n')
    const apiContractsPrompt = buildApiContractPrompt({
      mode: 'generate',
      userInput: params.userInput,
      conversationHistory: params.conversationHistory,
      loadedSkills: matched,
    })

    // 2. 获取完整能力目录
    const catalog = this.skillStore.getCatalog()

    // 3. 统一调用 LLM — 由 LLM 自主判断生成代码还是文字回复
    const codegenCallId = nextToolCallId('code_generator.generateStream')
    yield {
      type: 'tool_execution_start',
      toolCallId: codegenCallId,
      toolName: 'code_generator.generateStream',
        args: {
          mode: 'generate',
          hasFileData: !!params.fileData,
          hasConversationHistory: !!params.conversationHistory,
          hasExistingCode: !!params.existingCode,
        selectedSkills: matched,
        skillDocsChars: docs.length,
        apiContractsChars: apiContractsPrompt.length,
        skillCatalogChars: catalog.length,
      },
    }

    let sawError = false
    let textChunks = 0
    let codeChunks = 0
    let hasFinalCode = false
    let latestFinalCode = ''

    try {
      for await (const chunk of this.codeGen.generateStream({
        userInput: params.userInput,
        skillDocs: docs,
        skillCatalog: catalog,
        apiContractsPrompt,
        conversationHistory: params.conversationHistory,
        existingCode: params.existingCode,
        fileData: params.fileData,
        llmSelection: params.llmSelection,
      })) {
        if (chunk.type === 'text') textChunks += 1
        if (chunk.type === 'code_delta') codeChunks += 1
        if (chunk.type === 'code') {
          hasFinalCode = true
          latestFinalCode = chunk.content
        }
        if (chunk.type === 'error') sawError = true
        yield chunk
      }

      yield {
        type: 'tool_execution_end',
        toolCallId: codegenCallId,
        toolName: 'code_generator.generateStream',
        result: {
          mode: 'generate',
          textChunks,
          codeChunks,
          hasFinalCode,
          status: sawError ? 'error' : hasFinalCode ? 'ok' : codeChunks > 0 ? 'no_code' : 'text_only',
        },
        isError: sawError || (!hasFinalCode && codeChunks > 0),
      }

      // 4. 代码守卫：对最终 HTML 做静态契约检查，必要时自动再修一次
      if (hasFinalCode && latestFinalCode) {
        const guardCallId = nextToolCallId('code_guard.validate')
        const issues = analyzeGeneratedCode(latestFinalCode)
        const blocking = hasBlockingGuardIssue(issues)
        yield {
          type: 'tool_execution_start',
          toolCallId: guardCallId,
          toolName: 'code_guard.validate',
          args: {
            mode: 'generate',
            issueCount: issues.length,
            blockingIssueCount: issues.filter((x) => x.severity === 'error').length,
          },
        }
        yield {
          type: 'tool_execution_end',
          toolCallId: guardCallId,
          toolName: 'code_guard.validate',
          result: {
            mode: 'generate',
            issueCount: issues.length,
            blocking,
            issues,
          },
          isError: blocking,
        }

        if (blocking) {
          const repairCallId = nextToolCallId('code_generator.fixError')
          const guardReport = [
            '静态守卫检测到高风险接口/调用错误，请只做最小修改修复：',
            formatGuardIssuesForPrompt(issues),
          ].join('\n')

          yield {
            type: 'text',
            content: '\n\n检测到高风险接口调用问题，正在自动进行一次最小修复。',
          }
          yield {
            type: 'tool_execution_start',
            toolCallId: repairCallId,
            toolName: 'code_generator.fixError',
            args: {
              mode: 'guard_repair',
              issueCount: issues.length,
              errorPreview: guardReport.slice(0, 260),
            },
          }

          let repairSawError = false
          let repairedCode = ''

          for await (const fixChunk of this.codeGen.fixErrorStream({
            code: latestFinalCode,
            error: guardReport,
            skillDocs: docs,
            apiContractsPrompt,
            fileData: params.fileData,
            errorDiagnosis: [
              '- 错误类别: api',
              '- 根因判断: 代码守卫命中高风险接口调用/参数格式问题。',
              '- 修复清单:',
              '  - 仅修复命中的错误点，保持业务布局与交互不变。',
              '  - 优先改错接口路径/参数名/返回解析路径。',
              '  - 修复后必须保留 loading/ready/empty/error 状态收敛。',
            ].join('\n'),
            llmSelection: params.llmSelection,
          })) {
            if (fixChunk.type === 'error') repairSawError = true
            if (fixChunk.type === 'code') repairedCode = fixChunk.content
            yield fixChunk
          }

          yield {
            type: 'tool_execution_end',
            toolCallId: repairCallId,
            toolName: 'code_generator.fixError',
            result: {
              mode: 'guard_repair',
              fixed: !!repairedCode && !repairSawError,
              hasFinalCode: !!repairedCode,
            },
            isError: repairSawError || !repairedCode,
          }
        }
      }

      if (!hasFinalCode && !sawError && codeChunks > 0) {
        yield {
          type: 'error',
          content: '模型输出在代码中途结束，未生成最终完整代码。',
        }
      }
    } catch (err) {
      const errMsg = summarizeError(err)
      yield {
        type: 'tool_execution_end',
        toolCallId: codegenCallId,
        toolName: 'code_generator.generateStream',
        result: errMsg,
        isError: true,
      }
      yield { type: 'error', content: errMsg }
    }
  }

  /**
   * 修复代码错误
   */
  async fixCode(params: {
    code: string
    error: string
    userInput: string
    fileData?: string
    llmSelection?: LlmSelection
  }) {
    await this.init()

    let explanation = ''
    let fixedCode = ''
    let failed = false
    let lastError = ''

    for await (const chunk of this.fixCodeStream(params)) {
      if (chunk.type === 'text') {
        explanation += chunk.content
      } else if (chunk.type === 'code') {
        fixedCode = chunk.content
      } else if (chunk.type === 'error') {
        failed = true
        lastError = chunk.content
      }
    }

    if (fixedCode) {
      return {
        code: fixedCode,
        explanation,
        fixed: true,
      }
    }

    return {
      code: params.code,
      explanation: explanation || lastError || `自动修复失败。错误信息：${params.error}`,
      fixed: false,
    }
  }

  /**
   * 流式修复代码错误（用于前端在消息面板展示修复过程 + ThoughtChain）
   */
  async *fixCodeStream(params: {
    code: string
    error: string
    userInput: string
    fileData?: string
    llmSelection?: LlmSelection
  }): AsyncGenerator<AgentStreamChunk> {
    await this.init()

    let toolSeq = 0
    const nextToolCallId = (toolName: string) => `${toolName}-${Date.now()}-${++toolSeq}`
    const summarizeError = (err: unknown) => (err instanceof Error ? err.message : String(err))

    // 1) 修复阶段也走 OpenClaw 风格 inner loop：按需读取技能文档（不设固定 3 个上限）
    const totalSkillCount = this.skillStore.getSkillNames().length
    const loadedSkills: string[] = []
    const loadedDocsParts: string[] = []
    let plannerStoppedByGenerate = false
    const fixUserInput = params.userInput?.trim() || '自动修复地图运行时错误'
    const diagnosisCallId = nextToolCallId('error_analyzer.diagnose')
    yield {
      type: 'tool_execution_start',
      toolCallId: diagnosisCallId,
      toolName: 'error_analyzer.diagnose',
      args: {
        hasRuntimeError: !!params.error,
        runtimeErrorPreview: params.error.slice(0, 220),
        codeChars: params.code.length,
      },
    }
    const diagnosis = diagnoseRuntimeError(params.error, params.code)
    const diagnosisPrompt = formatDiagnosisForPrompt(diagnosis)
    yield {
      type: 'tool_execution_end',
      toolCallId: diagnosisCallId,
      toolName: 'error_analyzer.diagnose',
      result: diagnosis,
      isError: false,
    }

    const plannerInput = `${fixUserInput}\n\n诊断提示：${diagnosis.category}｜${diagnosis.likelyCause}`
    let iteration = 0

    while (true) {
      iteration += 1
      const planCallId = nextToolCallId('skill_tool_loop.decideNextAction')
      yield {
        type: 'tool_execution_start',
        toolCallId: planCallId,
        toolName: 'skill_tool_loop.decideNextAction',
        args: {
          iteration,
          mode: 'fix',
          loadedSkills,
          loadedSkillCount: loadedSkills.length,
          totalSkillCount,
          hasUserInput: !!params.userInput,
          hasRuntimeError: !!params.error,
          runtimeErrorPreview: params.error.slice(0, 180),
          hasExistingCode: !!params.code,
          currentCodeChars: params.code.length,
          hasFileData: !!params.fileData,
        },
      }

      let loopDecision: { action: 'read_skill_docs' | 'generate'; skillNames?: string[]; reason: string; source: string }
      try {
        const d = await this.skillPlanner.decideNextAction({
          userInput: plannerInput,
          loadedSkills,
          existingCode: params.code,
          runtimeError: params.error,
          fileData: params.fileData,
          mode: 'fix',
          llmSelection: params.llmSelection,
        })
        loopDecision = {
          action: d.action,
          skillNames: d.skillNames,
          reason: d.reason,
          source: 'llm',
        }

        yield {
          type: 'tool_execution_end',
          toolCallId: planCallId,
          toolName: 'skill_tool_loop.decideNextAction',
          result: {
            ...loopDecision,
            mode: 'fix',
            decisionSummary:
              loopDecision.action === 'read_skill_docs'
                ? `读取 skill 文档: ${(loopDecision.skillNames || []).join(', ') || '（未提供）'}，再进行修复`
                : '直接进入修复（基于错误信息与当前代码）',
            runtimeErrorPreview: params.error.slice(0, 180),
          },
          isError: false,
        }
      } catch (err) {
        yield {
          type: 'tool_execution_end',
          toolCallId: planCallId,
          toolName: 'skill_tool_loop.decideNextAction',
          result: summarizeError(err),
          isError: true,
        }
        break
      }

      if (loopDecision.action === 'generate') {
        plannerStoppedByGenerate = true
        break
      }

      const skillNames = dedupe((loopDecision.skillNames || []).filter(Boolean))
      if (skillNames.length === 0) break

      for (const skillName of skillNames) {
        if (loadedSkills.includes(skillName)) continue

        const docsCallId = nextToolCallId('doc_loader.readSkillDoc')
        yield {
          type: 'tool_execution_start',
          toolCallId: docsCallId,
          toolName: 'doc_loader.readSkillDoc',
          args: {
            skillName,
            mode: 'fix',
            selectionReason: loopDecision.reason || undefined,
            runtimeErrorPreview: params.error.slice(0, 140),
          },
        }

        try {
          const doc = await this.docLoader.loadMatchedDocs([skillName])
          if (!doc) throw new Error(`未找到 skill 文档: ${skillName}`)
          loadedSkills.push(skillName)
          loadedDocsParts.push(doc)

          yield {
            type: 'tool_execution_end',
            toolCallId: docsCallId,
            toolName: 'doc_loader.readSkillDoc',
            result: {
              mode: 'fix',
              skillName,
              totalLoadedSkills: loadedSkills.length,
              docChars: doc.length,
              docPreview: doc.slice(0, 160),
              selectionReason: loopDecision.reason || undefined,
            },
            isError: false,
          }
        } catch (err) {
          yield {
            type: 'tool_execution_end',
            toolCallId: docsCallId,
            toolName: 'doc_loader.readSkillDoc',
            result: summarizeError(err),
            isError: true,
          }
          break
        }
      }
    }

    // 仅在循环异常/中断导致未加载任何 skill 时回退；
    // 若模型明确选择 generate，说明其认为错误可直接基于 code+error 修复，尊重该决策。
    if (loadedSkills.length === 0 && !plannerStoppedByGenerate) {
      const fallbackCallId = nextToolCallId('skill_planner.selectSkills')
      yield {
        type: 'tool_execution_start',
        toolCallId: fallbackCallId,
        toolName: 'skill_planner.selectSkills',
        args: {
          fallback: true,
          mode: 'fix',
          userInputPreview: fixUserInput.slice(0, 120),
          errorPreview: params.error.slice(0, 180),
        },
      }

      try {
        const decision = await this.selectSkills({
          userInput: `${plannerInput}\n\n运行错误：${params.error}`,
          existingCode: params.code,
          fileData: params.fileData,
          llmSelection: params.llmSelection,
        })
        const fallbackSkills = decision.selectedSkills.filter((s) => !loadedSkills.includes(s))
        for (const skillName of fallbackSkills) {
          const doc = await this.docLoader.loadMatchedDocs([skillName])
          if (doc) {
            loadedSkills.push(skillName)
            loadedDocsParts.push(doc)
          }
        }

        yield {
          type: 'tool_execution_end',
          toolCallId: fallbackCallId,
          toolName: 'skill_planner.selectSkills',
          result: {
            ...decision,
            mode: 'fix',
            plannerStoppedByGenerate,
            selectedSkills: loadedSkills,
          },
          isError: false,
        }
      } catch (err) {
        // 最后的兜底：关键词匹配（只在 planner 失败时使用）
        const keywordCallId = nextToolCallId('skill_matcher.matchByKeywords')
        yield {
          type: 'tool_execution_start',
          toolCallId: keywordCallId,
          toolName: 'skill_matcher.matchByKeywords',
          args: { userInput: `${fixUserInput}\n${params.error}`.slice(0, 260), fixMode: true, fallback: true },
        }

        try {
          const fallbackMatched = this.skillMatcher.matchByKeywords(`${fixUserInput}\n${params.error}`)
          for (const skillName of fallbackMatched) {
            const doc = await this.docLoader.loadMatchedDocs([skillName])
            if (doc) {
              loadedSkills.push(skillName)
              loadedDocsParts.push(doc)
            }
          }

          yield {
            type: 'tool_execution_end',
            toolCallId: keywordCallId,
            toolName: 'skill_matcher.matchByKeywords',
            result: {
              matchedSkills: loadedSkills,
              count: loadedSkills.length,
              source: 'keyword_fallback_after_planner_error',
              plannerError: summarizeError(err),
              mode: 'fix',
            },
            isError: false,
          }
        } catch (fallbackErr) {
          yield {
            type: 'tool_execution_end',
            toolCallId: keywordCallId,
            toolName: 'skill_matcher.matchByKeywords',
            result: summarizeError(fallbackErr),
            isError: true,
          }
        }
      }
    }

    const matchedSkills = loadedSkills
    const docs = loadedDocsParts.join('\n\n---\n\n')
    const apiContractsPrompt = buildApiContractPrompt({
      mode: 'fix',
      userInput: fixUserInput,
      runtimeError: params.error,
      loadedSkills: matchedSkills,
    })

    // 3) 调用修复器
    const fixCallId = nextToolCallId('code_generator.fixError')
    yield {
      type: 'tool_execution_start',
      toolCallId: fixCallId,
      toolName: 'code_generator.fixError',
      args: {
        mode: 'fix',
        errorPreview: params.error.slice(0, 300),
        diagnosisCategory: diagnosis.category,
        matchedSkills,
        docChars: docs.length,
        apiContractsChars: apiContractsPrompt.length,
        codeChars: params.code.length,
        hasFileData: !!params.fileData,
      },
    }

    try {
      let sawError = false
      let textChunks = 0
      let codeChunks = 0
      let hasFinalCode = false
      let lastErrorChunk: string | null = null
      let latestFixedCode = ''

      for await (const chunk of this.codeGen.fixErrorStream({
        code: params.code,
        error: params.error,
        skillDocs: docs,
        apiContractsPrompt,
        fileData: params.fileData,
        errorDiagnosis: diagnosisPrompt,
        llmSelection: params.llmSelection,
      })) {
        if (chunk.type === 'text') textChunks += 1
        if (chunk.type === 'code_delta') codeChunks += 1
        if (chunk.type === 'code') {
          hasFinalCode = true
          latestFixedCode = chunk.content
        }
        if (chunk.type === 'error') {
          sawError = true
          lastErrorChunk = chunk.content
        }
        yield chunk
      }

      yield {
        type: 'tool_execution_end',
        toolCallId: fixCallId,
        toolName: 'code_generator.fixError',
        result: {
          mode: 'fix',
          fixed: hasFinalCode && !sawError,
          textChunks,
          codeChunks,
          hasFinalCode,
          matchedSkills,
          status: sawError ? 'error' : hasFinalCode ? 'ok' : 'no_code',
        },
        isError: sawError || !hasFinalCode,
      }

      if (hasFinalCode && latestFixedCode) {
        const guardCallId = nextToolCallId('code_guard.validate')
        const issues = analyzeGeneratedCode(latestFixedCode)
        const blocking = hasBlockingGuardIssue(issues)
        yield {
          type: 'tool_execution_start',
          toolCallId: guardCallId,
          toolName: 'code_guard.validate',
          args: {
            mode: 'fix',
            issueCount: issues.length,
            blockingIssueCount: issues.filter((x) => x.severity === 'error').length,
          },
        }
        yield {
          type: 'tool_execution_end',
          toolCallId: guardCallId,
          toolName: 'code_guard.validate',
          result: {
            mode: 'fix',
            issueCount: issues.length,
            blocking,
            issues,
          },
          isError: blocking,
        }

        if (blocking) {
          const repairCallId = nextToolCallId('code_generator.fixError')
          const guardReport = [
            '修复后代码仍命中高风险静态规则，请继续最小修改：',
            formatGuardIssuesForPrompt(issues),
          ].join('\n')

          yield {
            type: 'text',
            content: '\n\n修复结果仍存在阻断级风险，正在自动执行第二轮最小修复。',
          }
          yield {
            type: 'tool_execution_start',
            toolCallId: repairCallId,
            toolName: 'code_generator.fixError',
            args: {
              mode: 'fix_guard_repair',
              issueCount: issues.length,
              errorPreview: guardReport.slice(0, 260),
            },
          }

          let repairSawError = false
          let repairedCode = ''

          for await (const fixChunk of this.codeGen.fixErrorStream({
            code: latestFixedCode,
            error: guardReport,
            skillDocs: docs,
            apiContractsPrompt,
            fileData: params.fileData,
            errorDiagnosis: diagnosisPrompt,
            llmSelection: params.llmSelection,
          })) {
            if (fixChunk.type === 'error') repairSawError = true
            if (fixChunk.type === 'code') repairedCode = fixChunk.content
            yield fixChunk
          }

          yield {
            type: 'tool_execution_end',
            toolCallId: repairCallId,
            toolName: 'code_generator.fixError',
            result: {
              mode: 'fix_guard_repair',
              fixed: !!repairedCode && !repairSawError,
              hasFinalCode: !!repairedCode,
            },
            isError: repairSawError || !repairedCode,
          }
        }
      }

      if (!hasFinalCode && !sawError) {
        yield { type: 'error', content: '自动修复未生成可用代码' }
      }
      if (!hasFinalCode && sawError && lastErrorChunk) {
        // 错误已流式输出给前端，这里不重复发 error chunk，只保留 ThoughtChain 的失败态即可
      }
    } catch (err) {
      const msg = summarizeError(err)
      yield {
        type: 'tool_execution_end',
        toolCallId: fixCallId,
        toolName: 'code_generator.fixError',
        result: msg,
        isError: true,
      }
      yield { type: 'error', content: msg }
    }
  }

  // ========== 构建 LangGraph StateGraph ==========

  private buildGraph() {
    const self = this

    const graph = new StateGraph(AgentState)
      .addNode('selectSkill', async (state: AgentStateType) => {
        const decision = await self.selectSkills({
          userInput: state.userInput,
          conversationHistory: state.conversationHistory,
          existingCode: state.existingCode,
          fileData: state.fileData,
        })
        const matched = decision.selectedSkills
        return { matchedSkills: matched }
      })
      .addNode('loadDocs', async (state: AgentStateType) => {
        const docs = await self.docLoader.loadMatchedDocs(state.matchedSkills)
        return { loadedDocs: docs }
      })
      .addNode('generate', async (state: AgentStateType) => {
        try {
          const catalog = self.skillStore.getCatalog()
          const apiContractsPrompt = buildApiContractPrompt({
            mode: 'generate',
            userInput: state.userInput,
            conversationHistory: state.conversationHistory,
            loadedSkills: state.matchedSkills,
          })
          const result = await self.codeGen.generate({
            userInput: state.userInput,
            skillDocs: state.loadedDocs,
            skillCatalog: catalog,
            apiContractsPrompt,
            conversationHistory: state.conversationHistory,
            existingCode: state.existingCode,
            fileData: state.fileData,
          })
          return { code: result.code || null, response: result.explanation, error: null }
        } catch (err: any) {
          return { code: null, response: '', error: err.message }
        }
      })

    // 线性图：selectSkill → loadDocs → generate → END
    graph.addEdge('__start__', 'selectSkill')
    graph.addEdge('selectSkill', 'loadDocs')
    graph.addEdge('loadDocs', 'generate')
    graph.addEdge('generate', END)

    return graph.compile()
  }

  /**
   * 参考 OpenClaw：由模型决定是否/选择哪个 skill（基于 available_skills 列表）
   * 失败时回退到关键词匹配，避免完全不可用。
   */
  private async selectSkills(params: {
    userInput: string
    conversationHistory?: string
    existingCode?: string
    fileData?: string
        llmSelection?: LlmSelection
  }): Promise<{ selectedSkills: string[]; source: 'llm' | 'keyword_fallback'; reason: string }> {
    try {
      const dynamicMaxSkills = Math.max(this.skillStore.getSkillNames().length, 1)
      const decision = await this.skillPlanner.selectSkills({
        userInput: params.userInput,
        conversationHistory: params.conversationHistory,
        existingCode: params.existingCode,
        fileData: params.fileData,
        llmSelection: params.llmSelection,
        maxSkills: dynamicMaxSkills,
      })
      return {
        selectedSkills: decision.selectedSkills,
        source: 'llm',
        reason: decision.reason || 'LLM 基于 available_skills 选择 skill。',
      }
    } catch (err) {
      const fallback = this.skillMatcher.matchByKeywords(params.userInput)
      return {
        selectedSkills: fallback,
        source: 'keyword_fallback',
        reason: `SkillPlanner 失败，回退关键词匹配：${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }
}

function dedupe(items: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item)
      out.push(item)
    }
  }
  return out
}

interface RuntimeDiagnosis {
  category: 'syntax' | 'runtime' | 'network' | 'data' | 'api' | 'sandbox' | 'unknown'
  likelyCause: string
  confidence: number
  fixChecklist: string[]
}

function diagnoseRuntimeError(error: string, _code: string): RuntimeDiagnosis {
  const text = String(error || '')
  const lower = text.toLowerCase()

  if (/tmapgl is not defined/.test(lower)) {
    return {
      category: 'api',
      likelyCause: '页面未正确引入天地图 JS SDK，或 SDK 脚本加载顺序晚于业务脚本。',
      confidence: 0.97,
      fixChecklist: [
        '确认存在天地图脚本：<script src="https://api.tianditu.gov.cn/api/v5/js?tk=${TIANDITU_TOKEN}"></script>',
        '确保 SDK 脚本位于使用 TMapGL 的业务脚本之前。',
        '若使用模板拼接/修复流程，修复后再次检查脚本是否被意外移除。',
      ],
    }
  }

  if (/identifier .* has already been declared|syntaxerror|unexpected token/.test(lower)) {
    return {
      category: 'syntax',
      likelyCause: '同一作用域重复声明变量（常见于 let/const 在重复执行时再次声明）。',
      confidence: 0.92,
      fixChecklist: [
        '检查顶层 let/const 是否与运行器重复注入冲突。',
        '优先将重复声明改为单次声明（或改为函数作用域/IIFE 内部变量）。',
        '确保脚本重复执行时不会再次声明同名变量。',
      ],
    }
  }

  if (/cannot read properties of undefined|undefined \(reading '0'\)|is not a function|null/.test(lower)) {
    return {
      category: 'runtime',
      likelyCause: '对象/字段未判空即访问，或 API 返回结构与代码假设不一致。',
      confidence: 0.86,
      fixChecklist: [
        '先对 geometry / coordinates / e.features 做判空，再访问索引 [0]。',
        '按 geometry.type 提取坐标：Point=coordinates，MultiPoint=coordinates[0]。',
        '校验接口返回结构后再读取字段，不使用仅用于预览的字段（如 coordinatesPreview）。',
      ],
    }
  }

  if (/ajaxerror|fetcherror|404|500|not found|failed to fetch|network|cors|timeout/.test(lower)) {
    return {
      category: 'network',
      likelyCause: '请求 URL/端口/路径错误，或返回结构与解析逻辑不匹配。',
      confidence: 0.9,
      fixChecklist: [
        '先打印最终请求 URL 与状态码。',
        '核对上传文件 URL 是否来自系统返回，禁止手拼路径。',
        '确认 fetch().json() 后的数据结构再进行提取。',
      ],
    }
  }

  if (/geojson|featurecollection|valid geojson|数据格式|无法识别的数据格式/.test(lower)) {
    return {
      category: 'data',
      likelyCause: '传入 addSource 的不是合法 GeoJSON 对象，或提取路径错误。',
      confidence: 0.91,
      fixChecklist: [
        '确保 data 是 FeatureCollection/Feature 对象，而非 features 数组。',
        '按文件上下文给出的 GeoJSON 提取路径取值。',
        '补充 Array/Object 判定与错误提示。',
      ],
    }
  }

  if (/allow-modals|sandbox|ignored call to alert/.test(lower)) {
    return {
      category: 'sandbox',
      likelyCause: 'iframe 沙箱限制导致某些浏览器 API 被拦截（如 alert）。',
      confidence: 0.88,
      fixChecklist: [
        '避免依赖 alert 等被沙箱限制的 API。',
        '使用页面内提示组件替代阻塞弹窗。',
      ],
    }
  }

  return {
    category: 'unknown',
    likelyCause: '错误信息不足，需基于报错行号与上下文做最小改动修复。',
    confidence: 0.55,
    fixChecklist: [
      '先定位触发位置和调用栈，再决定修复点。',
      '避免整体重写，优先最小修复。',
      '修复后验证：语法、运行、请求、交互四项。',
    ],
  }
}

function formatDiagnosisForPrompt(d: RuntimeDiagnosis): string {
  return [
    `- 错误类别: ${d.category}`,
    `- 根因判断: ${d.likelyCause}`,
    `- 置信度: ${Math.round(d.confidence * 100)}%`,
    '- 修复清单:',
    ...d.fixChecklist.map((item) => `  - ${item}`),
  ].join('\n')
}

function hasLikelyMapIntent(userInput: string, fileData?: string): boolean {
  const text = `${userInput || ''}\n${fileData ? 'has-file-data' : ''}`
  return /地图|map|geojson|可视化|渲染|图层|标注|坐标|点数据|面数据|路径|行政区|poi|搜索|route|marker|layer/i.test(text)
}

function isLikelyCoreMapSkillName(name: string): boolean {
  return [
    'map-init',
    'bindGeoJSON',
    'bindPointLayer',
    'bindLineLayer',
    'bindPolygonLayer',
    'bindEvents',
    'popup',
    'marker',
    'search-poi',
    'search-route',
    'search-transit',
    'search-admin',
  ].includes(name)
}
