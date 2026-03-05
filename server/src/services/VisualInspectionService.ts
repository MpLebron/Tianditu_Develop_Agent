import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { config } from '../config.js'
import { createLLM } from '../llm/createLLM.js'
import type { LlmSelection } from '../provider/index.js'
import { getCatalogDefaultSelection, resolveLlmSelection } from '../provider/index.js'

export type VisualSeverity = 'low' | 'medium' | 'high'
export type VisualInspectStatus = 'ok' | 'unavailable'

export interface VisualInspectionInput {
  imageBase64: string
  hint?: string
  runId?: string
}

export interface VisualInspectionResult {
  status: VisualInspectStatus
  anomalous: boolean
  severity: VisualSeverity
  summary: string
  diagnosis: string
  repairHint: string
  confidence: number
  model: string
}

export interface VisualInspectionServiceOptions {
  llmSelection?: LlmSelection
  timeoutMs?: number
}

const MODEL_NAME = 'gpt-4.1-nano'
const MAX_HINT_CHARS = 1500
const MAX_SUMMARY_CHARS = 120
const MAX_DIAGNOSIS_CHARS = 500
const MAX_REPAIR_HINT_CHARS = 500

function buildDefaultSelection(): LlmSelection {
  const fallback = (() => {
    try {
      return resolveLlmSelection(
        { provider: config.llm.provider, model: config.llm.model },
        getCatalogDefaultSelection(),
      )
    } catch {
      return getCatalogDefaultSelection()
    }
  })()

  try {
    return resolveLlmSelection({ provider: 'openai', model: MODEL_NAME }, fallback)
  } catch {
    return fallback
  }
}

function clampChars(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars)
}

function normalizeSummary(text: unknown): string {
  const value = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : ''
  return clampChars(value || '视觉巡检已完成，未发现明确异常。', MAX_SUMMARY_CHARS)
}

function normalizeDiagnosis(text: unknown): string {
  const value = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : ''
  return clampChars(value || '未发现可确认的页面异常。', MAX_DIAGNOSIS_CHARS)
}

function normalizeRepairHint(text: unknown): string {
  const value = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : ''
  return clampChars(value || '无', MAX_REPAIR_HINT_CHARS)
}

function normalizeSeverity(value: unknown): VisualSeverity {
  if (value === 'low' || value === 'medium' || value === 'high') return value
  return 'low'
}

function normalizeConfidence(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return Number(n.toFixed(2))
}

function hasNegationNear(text: string, index: number): boolean {
  const start = Math.max(0, index - 8)
  const prefix = text.slice(start, index)
  return /(没有|无|未见|并无|并未|not\s|no\s|without)/i.test(prefix)
}

function inferAnomalousFromText(summary: string, diagnosis: string, repairHint: string): boolean {
  const text = `${summary}\n${diagnosis}\n${repairHint}`.toLowerCase()

  const strongSignals = [
    '地图区域为空',
    '黑屏',
    '全黑',
    '图层错位',
    '文字溢出',
    '加载失败',
    'failed to load',
    'not rendered',
    'render failed',
  ]
  if (strongSignals.some((term) => text.includes(term))) return true

  const weakSignals = ['空白', '缺失', '未加载', '无数据', '未渲染', 'blank', 'empty', 'no data', 'missing', 'error', 'failed']
  for (const term of weakSignals) {
    let idx = text.indexOf(term)
    while (idx !== -1) {
      if (!hasNegationNear(text, idx)) return true
      idx = text.indexOf(term, idx + term.length)
    }
  }
  return false
}

function inferSeverityFromText(summary: string, diagnosis: string, current: VisualSeverity): VisualSeverity {
  const text = `${summary}\n${diagnosis}`.toLowerCase()
  if (/黑屏|全黑|加载失败|failed|error/.test(text)) return 'high'
  if (/空白|未加载|无数据|未渲染|blank|empty|no data/.test(text)) return 'medium'
  return current
}

function summaryLooksPass(summary: string): boolean {
  const text = String(summary || '').toLowerCase()
  return /通过|正常|无明显异常|未发现异常|looks normal|no obvious issue/.test(text)
}

function diagnosisLooksPass(diagnosis: string): boolean {
  const text = String(diagnosis || '').toLowerCase()
  return /内容完整|均已渲染|已渲染|渲染正常|页面正常|无明显异常|未发现异常|没有空白|无空白|没有缺失|无缺失|looks normal|content complete|fully rendered|no missing|no blank/.test(text)
}

function parseJsonCandidate(text: string): Record<string, unknown> | null {
  const raw = String(text || '').trim()
  if (!raw) return null
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim()
  const candidate = fenced || raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
  if (!candidate || !candidate.startsWith('{')) return null
  try {
    const parsed = JSON.parse(candidate) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

function unavailableResult(reason: string): VisualInspectionResult {
  const diagnosis = clampChars(reason || '视觉巡检暂时不可用。', MAX_DIAGNOSIS_CHARS)
  return {
    status: 'unavailable',
    anomalous: false,
    severity: 'low',
    summary: '视觉巡检不可用',
    diagnosis,
    repairHint: '无',
    confidence: 0,
    model: MODEL_NAME,
  }
}

export class VisualInspectionService {
  private readonly llmSelection: LlmSelection
  private readonly timeoutMs: number

  constructor(options?: VisualInspectionServiceOptions) {
    this.llmSelection = options?.llmSelection || buildDefaultSelection()
    this.timeoutMs = Number.isFinite(options?.timeoutMs) ? Math.max(5000, Number(options?.timeoutMs)) : 20000
  }

  async inspect(input: VisualInspectionInput): Promise<VisualInspectionResult> {
    const imageBase64 = String(input.imageBase64 || '').trim()
    if (!imageBase64) return unavailableResult('截图内容为空，无法执行视觉巡检。')

    if (!config.llm.apiKey) return unavailableResult('LLM API Key 未配置，无法执行视觉巡检。')

    const hint = clampChars(String(input.hint || '').trim(), MAX_HINT_CHARS)
    const runId = String(input.runId || '').trim()

    const systemPrompt = [
      '你是地图页面视觉质检助手。',
      '你会收到一张地图应用页面截图。',
      '请只基于截图判断页面是否存在异常或错误迹象，并给出简洁诊断。',
      '如果地图区域空白、图层缺失、点位未显示、页面仅有加载态但数据未渲染，这些都必须判为异常（anomalous=true）。',
      '不要输出 Markdown，不要解释过程，只输出 JSON。',
      '输出 JSON schema:',
      '{"anomalous":boolean,"severity":"low|medium|high","summary":"...","diagnosis":"...","repairHint":"...","confidence":0-1}',
      '要求：',
      '1) 若无法确认异常，anomalous=false，severity=low。',
      '2) diagnosis 描述可观察到的现象，不要编造未见事实。',
      '3) repairHint 用于代码修复输入，1~3 句即可。',
    ].join('\n')

    const userPrompt = [
      runId ? `runId: ${runId}` : 'runId: (none)',
      `hint: ${hint || '(none)'}`,
      '请开始视觉巡检并输出 JSON。',
    ].join('\n')

    try {
      const llmBase = createLLM({
        llmSelection: this.llmSelection,
        temperature: 0.1,
        maxTokens: 500,
        timeoutMs: this.timeoutMs,
      })
      const llm = (llmBase as any).bind?.({
        response_format: { type: 'json_object' },
      }) || llmBase

      const response = await llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage({
          content: [
            { type: 'text', text: userPrompt },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } },
          ] as any,
        }),
      ])

      const content = typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content)
      const parsed = parseJsonCandidate(content)
      if (!parsed) {
        return unavailableResult('视觉诊断输出解析失败。')
      }

      const summary = normalizeSummary(parsed.summary)
      const diagnosis = normalizeDiagnosis(parsed.diagnosis)
      const repairHint = normalizeRepairHint(parsed.repairHint)

      let anomalous = parsed.anomalous === true
      const impliedAnomaly = inferAnomalousFromText(summary, diagnosis, repairHint)
      const impliedPass = summaryLooksPass(summary) || diagnosisLooksPass(diagnosis)
      if (!anomalous && impliedAnomaly) {
        anomalous = true
      }
      if (anomalous && impliedPass && !impliedAnomaly) {
        anomalous = false
      }

      let severity = anomalous ? normalizeSeverity(parsed.severity) : 'low'
      if (anomalous) {
        severity = inferSeverityFromText(summary, diagnosis, severity)
        if (severity === 'low') severity = 'medium'
      }

      const normalizedSummary = anomalous && summaryLooksPass(summary) && impliedAnomaly
        ? '检测到视觉异常（模型结论已纠偏）'
        : summary

      return {
        status: 'ok',
        anomalous,
        severity,
        summary: normalizedSummary,
        diagnosis,
        repairHint,
        confidence: normalizeConfidence(parsed.confidence),
        model: MODEL_NAME,
      }
    } catch (err: any) {
      return unavailableResult(err?.message || '视觉诊断调用失败。')
    }
  }
}
