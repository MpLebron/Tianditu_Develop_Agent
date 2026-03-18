import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { config } from '../config.js'
import { createLLM } from '../llm/createLLM.js'
import { extractTextContent, parseJsonObject } from './PlannerJson.js'
import type { DomainDecision } from './AgentRuntimeTypes.js'
import type { SkillStore } from './SkillStore.js'

export class DomainSelector {
  constructor(private skillStore: SkillStore) {}

  async select(params: {
    userInput: string
    conversationHistory?: string
    existingCode?: string
    fileData?: string
    runtimeError?: string
    mode: 'generate' | 'fix'
  }): Promise<DomainDecision> {
    const systemPrompt = `你是一个天地图智能体的领域选择器。

任务：先判断本轮请求应该进入哪些逻辑 package。

可选 package：
- tianditu-jsapi：地图本体、渲染、图层、控件、事件、覆盖物
- tianditu-lbs：搜索、地理编码、行政区划、驾车、公交
- tianditu-ui-design：页面视觉和布局
- error-solution：错误分类与修复策略
- echarts-charts：ECharts 图表本体配置

规则：
- 只输出 JSON
- packageIds 最多 3 个
- 需要地图展示搜索结果、路线或行政边界时，允许同时选择 tianditu-jsapi + tianditu-lbs
- 修复模式下，若运行错误明显是修复任务，通常包含 error-solution
- UI 请求才选择 tianditu-ui-design
- 地图 + 图表联动优先选择 tianditu-jsapi，图表 option 细节再补 echarts-charts

输出格式：
{"packageIds":["tianditu-jsapi"],"intent":"基础地图","reason":"需要创建地图并渲染内容","confidence":0.92}`

    const userPrompt = [
      `## 阶段\n${params.mode}`,
      '## 当前请求',
      params.userInput || '',
      params.runtimeError ? `\n## 运行错误\n${params.runtimeError.slice(0, 1200)}` : '',
      params.conversationHistory ? `\n## 对话历史\n${params.conversationHistory.slice(-1200)}` : '',
      params.existingCode ? '\n## 已有代码\n用户正在基于现有代码继续修改。' : '',
      params.fileData ? '\n## 上传文件\n存在上传文件，可能涉及数据渲染。' : '',
      '\n## 可用 package',
      this.skillStore.getPackagePlannerCatalog(),
    ].filter(Boolean).join('\n')

    try {
      const llm = createLLM({
        temperature: 0,
        maxTokens: 600,
        modelName: config.llm.auxModel,
      })
      const response = await llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ])
      const raw = extractTextContent(response.content).trim()
      const parsed = parseJsonObject(raw, {
        packageIds: [],
        intent: '',
        reason: '',
        confidence: 0,
      })

      const requested = Array.isArray(parsed.packageIds)
        ? parsed.packageIds.map(String).map((item) => item.trim()).filter(Boolean)
        : []
      const packageIds = dedupe(
        requested
          .map((id) => this.skillStore.getPackageEntry(id)?.id)
          .filter((id): id is string => Boolean(id)),
      ).slice(0, 3)

      if (packageIds.length > 0) {
        return {
          packageIds,
          intent: typeof parsed.intent === 'string' ? parsed.intent.trim() : '',
          reason: typeof parsed.reason === 'string' ? parsed.reason.trim() : '',
          confidence: normalizeConfidence(parsed.confidence),
          raw,
          decisionSource: 'llm',
          parseFailed: parsed.__parseFailed === true,
        }
      }

      return this.fallback(params, raw, parsed.__parseFailed === true ? 'parse_failed' : 'empty_packages')
    } catch (error) {
      return this.fallback(params, String(error), 'llm_error')
    }
  }

  private fallback(
    params: {
      userInput: string
      conversationHistory?: string
      existingCode?: string
      fileData?: string
      runtimeError?: string
      mode: 'generate' | 'fix'
    },
    raw: string,
    fallbackReason: string,
  ): DomainDecision {
    const text = [
      params.userInput || '',
      params.conversationHistory || '',
      params.runtimeError || '',
      params.fileData ? 'has-file-data' : '',
    ].join('\n')
    const lower = text.toLowerCase()
    const packageIds = new Set<string>()

    if (/poi|搜索|地理编码|逆地理|行政区|路线规划|驾车|公交|地铁|querytype|busline|linetype|transit|drive|geocode/.test(text)) {
      packageIds.add('tianditu-lbs')
    }
    if (/地图|map|tmapgl|geojson|图层|marker|popup|热力图|聚合|可视化|渲染/.test(text) || params.fileData) {
      packageIds.add('tianditu-jsapi')
    }
    if (/页面丑|优化ui|优化界面|视觉|风格|布局|重设计|ui/.test(lower)) {
      packageIds.add('tianditu-ui-design')
    }
    if (params.mode === 'fix' || params.runtimeError) {
      packageIds.add('error-solution')
    }
    if (/echarts|图表|柱状图|折线图|饼图|雷达图|仪表盘/.test(text)) {
      if (/option|series|legend|tooltip|datazoom|柱状图|折线图|饼图|雷达图|仪表盘/.test(text)) {
        packageIds.add('echarts-charts')
      }
    }
    if (packageIds.size === 0) {
      packageIds.add(params.mode === 'fix' ? 'error-solution' : 'tianditu-jsapi')
    }

    const selected = Array.from(packageIds).filter((id) => this.skillStore.getPackageEntry(id)).slice(0, 3)

    return {
      packageIds: selected,
      intent: selected.includes('tianditu-lbs') ? 'LBS 场景' : '地图场景',
      reason: 'LLM 未给出有效 package，使用声明式 fallback 进行领域分流。',
      confidence: 0.55,
      raw,
      decisionSource: 'fallback',
      fallbackReason,
    }
  }
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items))
}

function normalizeConfidence(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 0.6
  if (n > 1) return Math.max(0, Math.min(1, n / 100))
  return Math.max(0, Math.min(1, n))
}
