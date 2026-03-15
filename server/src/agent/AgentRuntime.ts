import type { LlmSelection } from '../provider/index.js'
import { config } from '../config.js'
import type { CodeGenerator } from './CodeGenerator.js'
import { selectContracts } from './ContractSelector.js'
import type { DocLoader } from './DocLoader.js'
import { ErrorAnalyzer, formatErrorAnalysisForPrompt } from './ErrorAnalyzer.js'
import { verifyCode } from './CodeVerifier.js'
import type { DomainDecision, ErrorAnalysisResult, ReferencePlan } from './AgentRuntimeTypes.js'
import { DomainSelector } from './DomainSelector.js'
import { FileIntelligenceService } from './FileIntelligenceService.js'
import { ReferencePlanner } from './ReferencePlanner.js'
import type { SkillStore } from './SkillStore.js'

type CodeStreamChunk = { type: 'text' | 'code_start' | 'code_delta' | 'code' | 'code_reset' | 'error'; content: string }
type ToolStartChunk = {
  type: 'tool_execution_start'
  toolCallId: string
  toolName: string
  args: unknown
  startedAtMs: number
}
type ToolEndChunk = {
  type: 'tool_execution_end'
  toolCallId: string
  toolName: string
  result: unknown
  isError: boolean
  startedAtMs: number
  endedAtMs: number
  durationMs: number
  decisionSource?: string
  selectedPackages?: string[]
  selectedReferences?: string[]
  selectedContracts?: string[]
  fallbackReason?: string
  vetoApplied?: boolean
}

export type AgentRuntimeChunk = CodeStreamChunk | ToolStartChunk | ToolEndChunk

export class AgentRuntime {
  private domainSelector: DomainSelector
  private referencePlanner: ReferencePlanner
  private errorAnalyzer: ErrorAnalyzer
  private fileIntelligence: FileIntelligenceService

  constructor(
    private deps: {
      skillStore: SkillStore
      docLoader: DocLoader
      codeGen: CodeGenerator
    },
  ) {
    this.domainSelector = new DomainSelector(this.deps.skillStore)
    this.referencePlanner = new ReferencePlanner(this.deps.skillStore)
    this.errorAnalyzer = new ErrorAnalyzer(this.deps.skillStore)
    this.fileIntelligence = new FileIntelligenceService()
  }

  async *invokeStream(params: {
    userInput: string
    fileData?: string
    conversationHistory?: string
    existingCode?: string
    llmSelection?: LlmSelection
  }): AsyncGenerator<AgentRuntimeChunk> {
    let effectiveFileData = params.fileData
    const state = {
      selectedPackages: [] as string[],
      loadedReferences: [] as string[],
      loadedDocs: '',
      contractIds: [] as string[],
      contractPrompt: '',
    }
    let toolSeq = 0
    const nextToolCallId = (toolName: string) => `${toolName}-${Date.now()}-${++toolSeq}`

    if (params.fileData) {
      const inspectCtx = startTool(nextToolCallId, 'file_intelligence.inspect', {
        mode: 'generate',
        hasFileData: true,
      })
      yield inspectCtx.start
      const inspected = await this.fileIntelligence.enrich(params.fileData)
      effectiveFileData = inspected.fileData
      yield endTool(inspectCtx, {
        mode: 'generate',
        ...inspected.summary,
      }, inspected.summary.status === 'error', {})
    }

    const domainCtx = startTool(nextToolCallId, 'domain_selector.selectPackages', {
      mode: 'generate',
      hasConversationHistory: !!params.conversationHistory,
      hasExistingCode: !!params.existingCode,
      hasFileData: !!effectiveFileData,
    })
    yield domainCtx.start
    const domainDecision = await this.domainSelector.select({
      userInput: params.userInput,
      conversationHistory: params.conversationHistory,
      existingCode: params.existingCode,
      fileData: effectiveFileData,
      mode: 'generate',
      llmSelection: params.llmSelection,
    })
    state.selectedPackages = domainDecision.packageIds
    yield endTool(domainCtx, domainDecision, false, {
      decisionSource: domainDecision.decisionSource,
      selectedPackages: domainDecision.packageIds,
      fallbackReason: domainDecision.fallbackReason,
    })

    const packageEntryCtx = startTool(nextToolCallId, 'context_assembler.loadPackages', {
      mode: 'generate',
      selectedPackages: state.selectedPackages,
    })
    yield packageEntryCtx.start
    const packageDocs = await this.deps.skillStore.loadPackageEntries(state.selectedPackages)
    yield endTool(packageEntryCtx, {
      mode: 'generate',
      selectedPackages: state.selectedPackages,
      packageDocsChars: packageDocs.length,
    }, false, { selectedPackages: state.selectedPackages })

    let lastPlan: ReferencePlan | null = null
    const maxPlanRounds = Math.max(1, config.agentRuntime.maxPlanRounds || 1)
    for (let iteration = 1; iteration <= maxPlanRounds; iteration += 1) {
      const refCtx = startTool(nextToolCallId, 'reference_planner.decide', {
        mode: 'generate',
        iteration,
        selectedPackages: state.selectedPackages,
        loadedReferences: state.loadedReferences,
      })
      yield refCtx.start
      const plan = await this.referencePlanner.decide({
        userInput: params.userInput,
        selectedPackageIds: state.selectedPackages,
        loadedReferences: state.loadedReferences,
        conversationHistory: params.conversationHistory,
        existingCode: params.existingCode,
        fileData: effectiveFileData,
        mode: 'generate',
        llmSelection: params.llmSelection,
      })
      lastPlan = plan
      yield endTool(refCtx, {
        ...plan,
        mode: 'generate',
        decisionSummary: plan.action === 'read_skill_docs'
          ? `读取 reference: ${plan.referenceIds.join(', ') || '（未提供）'}`
          : '直接进入生成',
      }, false, {
        decisionSource: plan.decisionSource,
        selectedPackages: state.selectedPackages,
        selectedReferences: plan.referenceIds,
        selectedContracts: plan.contractIds,
        fallbackReason: plan.fallbackReason,
      })

      if (plan.action === 'generate' || plan.referenceIds.length === 0) {
        break
      }

      const docsCtx = startTool(nextToolCallId, 'doc_loader.readReferenceDocs', {
        mode: 'generate',
        referenceIds: plan.referenceIds,
      })
      yield docsCtx.start
      const docs = await this.deps.skillStore.loadDocs(plan.referenceIds, { includePackageEntries: false })
      state.loadedReferences = dedupe([...state.loadedReferences, ...plan.referenceIds])
      state.loadedDocs = mergeDocs(state.loadedDocs, docs)
      yield endTool(docsCtx, {
        mode: 'generate',
        loadedReferences: state.loadedReferences,
        docChars: docs.length,
      }, false, {
        selectedPackages: state.selectedPackages,
        selectedReferences: state.loadedReferences,
      })
    }

    const selectedContracts = selectContracts({
      userInput: params.userInput,
      conversationHistory: params.conversationHistory,
      loadedSkills: state.loadedReferences,
      mode: 'generate',
      suggestedIds: lastPlan?.contractIds,
      source: 'planner',
    })
    state.contractIds = selectedContracts.contractIds
    state.contractPrompt = selectedContracts.prompt

    const contextCtx = startTool(nextToolCallId, 'context_assembler.load', {
      mode: 'generate',
      selectedPackages: state.selectedPackages,
      selectedReferences: state.loadedReferences,
      selectedContracts: state.contractIds,
    })
    yield contextCtx.start
    const assembledDocs = mergeDocs(packageDocs, state.loadedDocs)
    const skillCatalog = this.deps.skillStore.getCatalog()
    yield endTool(contextCtx, {
      mode: 'generate',
      selectedPackages: state.selectedPackages,
      selectedReferences: state.loadedReferences,
      selectedContracts: state.contractIds,
      skillDocsChars: assembledDocs.length,
      contractChars: state.contractPrompt.length,
    }, false, {
      selectedPackages: state.selectedPackages,
      selectedReferences: state.loadedReferences,
      selectedContracts: state.contractIds,
    })

    const codegenCtx = startTool(nextToolCallId, 'code_generator.generateStream', {
      mode: 'generate',
      selectedPackages: state.selectedPackages,
      selectedReferences: state.loadedReferences,
      selectedContracts: state.contractIds,
      hasFileData: !!params.fileData,
      hasFileDataIntelligence: !!effectiveFileData,
      hasConversationHistory: !!params.conversationHistory,
      hasExistingCode: !!params.existingCode,
    })
    yield codegenCtx.start

    let sawError = false
    let textChunks = 0
    let codeChunks = 0
    let hasFinalCode = false
    let latestFinalCode = ''

    try {
      for await (const chunk of this.deps.codeGen.generateStream({
        userInput: params.userInput,
        skillDocs: assembledDocs,
        skillCatalog,
        apiContractsPrompt: state.contractPrompt,
        conversationHistory: params.conversationHistory,
        existingCode: params.existingCode,
        fileData: effectiveFileData,
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
    } finally {
      yield endTool(codegenCtx, {
        mode: 'generate',
        textChunks,
        codeChunks,
        hasFinalCode,
        status: sawError ? 'error' : hasFinalCode ? 'ok' : codeChunks > 0 ? 'no_code' : 'text_only',
      }, sawError || (!hasFinalCode && codeChunks > 0), {
        selectedPackages: state.selectedPackages,
        selectedReferences: state.loadedReferences,
        selectedContracts: state.contractIds,
      })
    }

    if (config.agentRuntime.enableVerifier && hasFinalCode && latestFinalCode) {
      yield* this.verifyAndRepair({
        nextToolCallId,
        mode: 'generate',
        code: latestFinalCode,
        critiquePrefix: '静态 verifier 检测到阻断级问题，请只做最小修改修复：',
        skillDocs: assembledDocs,
        apiContractsPrompt: state.contractPrompt,
        fileData: effectiveFileData,
        llmSelection: params.llmSelection,
        selectedPackages: state.selectedPackages,
        selectedReferences: state.loadedReferences,
        selectedContracts: state.contractIds,
      })
    }
  }

  async *fixCodeStream(params: {
    code: string
    error: string
    userInput: string
    fileData?: string
    llmSelection?: LlmSelection
  }): AsyncGenerator<AgentRuntimeChunk> {
    let effectiveFileData = params.fileData
    const state = {
      selectedPackages: [] as string[],
      loadedReferences: [] as string[],
      contractIds: [] as string[],
      contractPrompt: '',
      skillDocs: '',
    }
    let toolSeq = 0
    const nextToolCallId = (toolName: string) => `${toolName}-${Date.now()}-${++toolSeq}`

    if (params.fileData) {
      const inspectCtx = startTool(nextToolCallId, 'file_intelligence.inspect', {
        mode: 'fix',
        hasFileData: true,
      })
      yield inspectCtx.start
      const inspected = await this.fileIntelligence.enrich(params.fileData)
      effectiveFileData = inspected.fileData
      yield endTool(inspectCtx, {
        mode: 'fix',
        ...inspected.summary,
      }, inspected.summary.status === 'error', {})
    }

    const evidenceCtx = startTool(nextToolCallId, 'error_analyzer.analyze', {
      mode: 'fix',
      codeChars: params.code.length,
      errorPreview: params.error.slice(0, 220),
    })
    yield evidenceCtx.start
    const analyzed = await this.errorAnalyzer.analyze({
      error: params.error,
      code: params.code,
      fileData: effectiveFileData,
      llmSelection: params.llmSelection,
    })
    const analysis = analyzed.analysis
    yield endTool(evidenceCtx, {
      mode: 'fix',
      ...analysis,
      evidence: analyzed.evidenceText,
    }, false, {
      decisionSource: analysis.decisionSource,
      selectedPackages: analysis.suggestedPackages,
      selectedReferences: analysis.suggestedReferences,
      selectedContracts: analysis.suggestedContracts,
      fallbackReason: analysis.fallbackReason,
    })

    const plannerInput = `${params.userInput || '自动修复地图运行错误'}\n\n错误分析：${analysis.category}｜${analysis.likelyCause}`
    const domainCtx = startTool(nextToolCallId, 'domain_selector.selectPackages', {
      mode: 'fix',
      hasRuntimeError: !!params.error,
    })
    yield domainCtx.start
    const domainDecision = await this.domainSelector.select({
      userInput: plannerInput,
      existingCode: params.code,
      fileData: effectiveFileData,
      runtimeError: params.error,
      mode: 'fix',
      llmSelection: params.llmSelection,
    })
    state.selectedPackages = dedupe([...domainDecision.packageIds, ...analysis.suggestedPackages])
    yield endTool(domainCtx, {
      mode: 'fix',
      ...domainDecision,
      mergedWithAnalyzer: analysis.suggestedPackages,
    }, false, {
      decisionSource: domainDecision.decisionSource,
      selectedPackages: state.selectedPackages,
      fallbackReason: domainDecision.fallbackReason,
    })

    const packageEntryCtx = startTool(nextToolCallId, 'context_assembler.loadPackages', {
      mode: 'fix',
      selectedPackages: state.selectedPackages,
    })
    yield packageEntryCtx.start
    const packageDocs = await this.deps.skillStore.loadPackageEntries(state.selectedPackages)
    yield endTool(packageEntryCtx, {
      mode: 'fix',
      selectedPackages: state.selectedPackages,
      packageDocsChars: packageDocs.length,
    }, false, { selectedPackages: state.selectedPackages })

    let lastPlan: ReferencePlan | null = null
    const maxPlanRounds = Math.max(1, config.agentRuntime.maxPlanRounds || 1)
    for (let iteration = 1; iteration <= maxPlanRounds; iteration += 1) {
      const refCtx = startTool(nextToolCallId, 'reference_planner.decide', {
        mode: 'fix',
        iteration,
        selectedPackages: state.selectedPackages,
        loadedReferences: state.loadedReferences,
      })
      yield refCtx.start
      const plan = await this.referencePlanner.decide({
        userInput: plannerInput,
        selectedPackageIds: state.selectedPackages,
        loadedReferences: state.loadedReferences,
        existingCode: params.code,
        fileData: effectiveFileData,
        runtimeError: params.error,
        mode: 'fix',
        llmSelection: params.llmSelection,
      })
      lastPlan = plan
      yield endTool(refCtx, {
        mode: 'fix',
        ...plan,
        analyzerSuggestedReferences: analysis.suggestedReferences,
      }, false, {
        decisionSource: plan.decisionSource,
        selectedPackages: state.selectedPackages,
        selectedReferences: plan.referenceIds,
        selectedContracts: plan.contractIds,
        fallbackReason: plan.fallbackReason,
      })

      const plannedRefs = dedupe([...analysis.suggestedReferences, ...plan.referenceIds])
      if (plannedRefs.length === 0 || plan.action === 'generate') {
        break
      }

      const docsCtx = startTool(nextToolCallId, 'doc_loader.readReferenceDocs', {
        mode: 'fix',
        referenceIds: plannedRefs,
      })
      yield docsCtx.start
      const docs = await this.deps.skillStore.loadDocs(plannedRefs, { includePackageEntries: false })
      state.loadedReferences = dedupe([...state.loadedReferences, ...plannedRefs])
      state.skillDocs = mergeDocs(state.skillDocs, docs)
      yield endTool(docsCtx, {
        mode: 'fix',
        loadedReferences: state.loadedReferences,
        docChars: docs.length,
      }, false, {
        selectedPackages: state.selectedPackages,
        selectedReferences: state.loadedReferences,
      })
      break
    }

    const selectedContracts = selectContracts({
      userInput: plannerInput,
      runtimeError: params.error,
      loadedSkills: state.loadedReferences,
      mode: 'fix',
      suggestedIds: dedupe([...(lastPlan?.contractIds || []), ...analysis.suggestedContracts]),
      source: 'analyzer',
    })
    state.contractIds = selectedContracts.contractIds
    state.contractPrompt = selectedContracts.prompt
    state.skillDocs = mergeDocs(packageDocs, state.skillDocs)

    const fixCtx = startTool(nextToolCallId, 'code_generator.fixError', {
      mode: 'fix',
      selectedPackages: state.selectedPackages,
      selectedReferences: state.loadedReferences,
      selectedContracts: state.contractIds,
      codeChars: params.code.length,
      hasFileData: !!effectiveFileData,
    })
    yield fixCtx.start

    let sawError = false
    let textChunks = 0
    let codeChunks = 0
    let hasFinalCode = false
    let latestFixedCode = ''

    try {
      for await (const chunk of this.deps.codeGen.fixErrorStream({
        code: params.code,
        error: params.error,
        skillDocs: state.skillDocs,
        apiContractsPrompt: state.contractPrompt,
        fileData: effectiveFileData,
        errorDiagnosis: formatErrorAnalysisForPrompt(analysis),
        llmSelection: params.llmSelection,
      })) {
        if (chunk.type === 'text') textChunks += 1
        if (chunk.type === 'code_delta') codeChunks += 1
        if (chunk.type === 'code') {
          hasFinalCode = true
          latestFixedCode = chunk.content
        }
        if (chunk.type === 'error') sawError = true
        yield chunk
      }
    } finally {
      yield endTool(fixCtx, {
        mode: 'fix',
        textChunks,
        codeChunks,
        hasFinalCode,
        fixed: hasFinalCode && !sawError,
        status: sawError ? 'error' : hasFinalCode ? 'ok' : 'no_code',
      }, sawError || !hasFinalCode, {
        selectedPackages: state.selectedPackages,
        selectedReferences: state.loadedReferences,
        selectedContracts: state.contractIds,
      })
    }

    if (config.agentRuntime.enableVerifier && hasFinalCode && latestFixedCode) {
      yield* this.verifyAndRepair({
        nextToolCallId,
        mode: 'fix',
        code: latestFixedCode,
        critiquePrefix: '修复后的代码仍命中阻断级 verifier 规则，请继续最小修改：',
        skillDocs: state.skillDocs,
        apiContractsPrompt: state.contractPrompt,
        fileData: effectiveFileData,
        llmSelection: params.llmSelection,
        errorDiagnosis: formatErrorAnalysisForPrompt(analysis),
        selectedPackages: state.selectedPackages,
        selectedReferences: state.loadedReferences,
        selectedContracts: state.contractIds,
      })
    }
  }

  private async *verifyAndRepair(params: {
    nextToolCallId: (toolName: string) => string
    mode: 'generate' | 'fix'
    code: string
    critiquePrefix: string
    skillDocs: string
    apiContractsPrompt: string
    fileData?: string
    llmSelection?: LlmSelection
    errorDiagnosis?: string
    selectedPackages: string[]
    selectedReferences: string[]
    selectedContracts: string[]
  }): AsyncGenerator<AgentRuntimeChunk> {
    let currentCode = params.code
    const rounds = Math.max(1, config.agentRuntime.maxVerifyRepairRounds || 1)

    for (let round = 0; round <= rounds; round += 1) {
      const verifyCtx = startTool(params.nextToolCallId, 'code_verifier.validate', {
        mode: params.mode,
        round,
      })
      yield verifyCtx.start
      const verification = verifyCode(currentCode, { fileData: params.fileData })
      yield endTool(verifyCtx, {
        mode: params.mode,
        issueCount: verification.issues.length,
        blocking: verification.blocking,
        issues: verification.issues,
      }, verification.blocking, {
        selectedPackages: params.selectedPackages,
        selectedReferences: params.selectedReferences,
        selectedContracts: params.selectedContracts,
        vetoApplied: verification.blocking,
      })

      if (!verification.blocking || round >= rounds) break

      const repairCtx = startTool(params.nextToolCallId, 'code_generator.fixError', {
        mode: `${params.mode}_verifier_repair`,
        issueCount: verification.issues.length,
      })
      yield { type: 'text', content: '\n\n检测到阻断级 verifier 风险，正在自动做一次最小修复。' }
      yield repairCtx.start

      let repairedCode = ''
      let sawError = false
      for await (const chunk of this.deps.codeGen.fixErrorStream({
        code: currentCode,
        error: `${params.critiquePrefix}\n${verification.critique}`,
        skillDocs: params.skillDocs,
        apiContractsPrompt: params.apiContractsPrompt,
        fileData: params.fileData,
        errorDiagnosis: params.errorDiagnosis,
        llmSelection: params.llmSelection,
      })) {
        if (chunk.type === 'code') repairedCode = chunk.content
        if (chunk.type === 'error') sawError = true
        yield chunk
      }

      yield endTool(repairCtx, {
        mode: `${params.mode}_verifier_repair`,
        fixed: !!repairedCode && !sawError,
        hasFinalCode: !!repairedCode,
      }, sawError || !repairedCode, {
        selectedPackages: params.selectedPackages,
        selectedReferences: params.selectedReferences,
        selectedContracts: params.selectedContracts,
      })

      if (!repairedCode || sawError) break
      currentCode = repairedCode
    }
  }
}

function mergeDocs(base: string, next: string): string {
  if (!base) return next
  if (!next) return base
  return `${base}\n\n---\n\n${next}`
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items))
}

function startTool(
  nextToolCallId: (toolName: string) => string,
  toolName: string,
  args: unknown,
): { toolCallId: string; toolName: string; startedAtMs: number; start: ToolStartChunk } {
  const startedAtMs = Date.now()
  const toolCallId = nextToolCallId(toolName)
  return {
    toolCallId,
    toolName,
    startedAtMs,
    start: {
      type: 'tool_execution_start',
      toolCallId,
      toolName,
      args,
      startedAtMs,
    },
  }
}

function endTool(
  ctx: { toolCallId: string; toolName: string; startedAtMs: number },
  result: unknown,
  isError: boolean,
  meta?: {
    decisionSource?: string
    selectedPackages?: string[]
    selectedReferences?: string[]
    selectedContracts?: string[]
    fallbackReason?: string
    vetoApplied?: boolean
  },
): ToolEndChunk {
  const endedAtMs = Date.now()
  return {
    type: 'tool_execution_end',
    toolCallId: ctx.toolCallId,
    toolName: ctx.toolName,
    result,
    isError,
    startedAtMs: ctx.startedAtMs,
    endedAtMs,
    durationMs: Math.max(0, endedAtMs - ctx.startedAtMs),
    decisionSource: meta?.decisionSource,
    selectedPackages: meta?.selectedPackages,
    selectedReferences: meta?.selectedReferences,
    selectedContracts: meta?.selectedContracts,
    fallbackReason: meta?.fallbackReason,
    vetoApplied: meta?.vetoApplied,
  }
}
