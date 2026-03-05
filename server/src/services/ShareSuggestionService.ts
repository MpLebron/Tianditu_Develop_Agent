import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { config } from '../config.js'
import { createLLM } from '../llm/createLLM.js'
import type { LlmSelection } from '../provider/index.js'
import { getCatalogDefaultSelection, resolveLlmSelection } from '../provider/index.js'

export interface ShareSuggestionInput {
  code: string
  hint?: string
}

export interface ShareSuggestionResult {
  title: string
  description: string
  source: 'ai' | 'fallback'
}

const MAX_CODE_CHARS = 120 * 1024
const MAX_HINT_CHARS = 1500
const MAX_TITLE_CHARS = 80
const MAX_DESCRIPTION_CHARS = 240
const GENERIC_TITLE_RE = /^(地图快照|地图应用快照|地图应用|地图页面)\s*\d{0,4}/

function trimText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function clampChars(text: string, limit: number): string {
  return text.length <= limit ? text : text.slice(0, limit)
}

function sanitizeTitle(raw: string): string {
  const compact = raw.replace(/\s+/g, ' ').trim()
  return clampChars(compact, MAX_TITLE_CHARS)
}

function sanitizeDescription(raw: string): string {
  const compact = raw.replace(/\s+/g, ' ').trim()
  return clampChars(compact, MAX_DESCRIPTION_CHARS)
}

function jsonCandidate(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()

  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  return text.slice(start, end + 1)
}

function parseSuggestionJson(rawText: string): { title?: string; description?: string } | null {
  const candidate = jsonCandidate(rawText)
  if (!candidate) return null
  try {
    const parsed = JSON.parse(candidate)
    if (!parsed || typeof parsed !== 'object') return null
    return {
      title: typeof parsed.title === 'string' ? parsed.title : undefined,
      description: typeof parsed.description === 'string' ? parsed.description : undefined,
    }
  } catch {
    return null
  }
}

function redactCodeForPrompt(code: string, tiandituToken?: string): string {
  let redacted = String(code || '')

  // 占位符和常见 token 形态统一替换
  redacted = redacted.replace(/\$\{TIANDITU_TOKEN\}/g, '[TIANDITU_TOKEN]')
  redacted = redacted.replace(/(tk=)[a-z0-9]{32}/gi, '$1[REDACTED_TOKEN]')
  redacted = redacted.replace(/(["'])tk\1\s*:\s*(["'])[a-z0-9]{32}\2/gi, '"tk":"[REDACTED_TOKEN]"')

  if (tiandituToken) {
    const escaped = tiandituToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    redacted = redacted.replace(new RegExp(escaped, 'g'), '[REDACTED_TOKEN]')
  }

  return redacted
}

function detectScene(text: string): {
  key: 'transit' | 'drive' | 'admin' | 'poi' | 'geocode' | 'heatmap' | 'marker' | 'polygon' | 'base'
  label: string
} {
  const lower = text.toLowerCase()

  if (/transit|busline|linetype|公交|地铁|换乘|segmentline/.test(lower)) {
    return { key: 'transit', label: '公交地铁规划' }
  }
  if (/\/drive|orig|dest|驾车|路线规划|routelatlon/.test(lower)) {
    return { key: 'drive', label: '驾车路线规划' }
  }
  if (/administrative|行政区|district|boundary|childlevel/.test(lower)) {
    return { key: 'admin', label: '行政区边界展示' }
  }
  if (/\/search|querytype|poi|周边搜索|pointlonlat|地名搜索/.test(lower)) {
    return { key: 'poi', label: 'POI 检索分析' }
  }
  if (/geocoder|地理编码|逆地理|reverse-geocode/.test(lower)) {
    return { key: 'geocode', label: '地理编码定位' }
  }
  if (/heatmap|热力图/.test(lower)) {
    return { key: 'heatmap', label: '热力分布可视化' }
  }
  if (/marker|标注|景点|popup/.test(lower)) {
    return { key: 'marker', label: '点位标注地图' }
  }
  if (/polygon|fill|多边形|地块|geojson/.test(lower)) {
    return { key: 'polygon', label: '区域面数据可视化' }
  }
  return { key: 'base', label: '地图应用快照' }
}

interface CodeSignals {
  pageTitle: string
  headings: string[]
  apiEndpoints: string[]
  chinesePhrases: string[]
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr))
}

function cleanSignalText(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractCodeSignals(code: string): CodeSignals {
  const titleMatch = code.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const pageTitle = cleanSignalText(titleMatch?.[1] || '')

  const headingMatches = [...code.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
    .map((m) => cleanSignalText(m[1] || ''))
    .filter(Boolean)
    .slice(0, 6)

  const endpointMatches = [...code.matchAll(/\/api\/tianditu\/[a-z-]+/gi)]
    .map((m) => m[0].toLowerCase())
  const apiEndpoints = uniq(endpointMatches).slice(0, 8)

  const phraseCandidates = [...code.matchAll(/["'`]([^"'`\n]{2,40})["'`]/g)]
    .map((m) => cleanSignalText(m[1] || ''))
    .filter((text) => /[\u4e00-\u9fa5]/.test(text))
    .filter((text) => text.length >= 2 && text.length <= 24)
    .filter((text) => !/^https?:\/\//i.test(text))
    .filter((text) => !/^(true|false|null|undefined)$/i.test(text))
    .slice(0, 40)
  const chinesePhrases = uniq(phraseCandidates).slice(0, 12)

  return {
    pageTitle,
    headings: headingMatches,
    apiEndpoints,
    chinesePhrases,
  }
}

function fallbackSuggestion(input: ShareSuggestionInput): ShareSuggestionResult {
  const hint = trimText(input.hint)
  const signals = extractCodeSignals(input.code)
  const scene = detectScene(`${hint}\n${signals.pageTitle}\n${signals.headings.join(' ')}\n${input.code}`)
  const hintPrefix = hint ? `${clampChars(hint.replace(/\s+/g, ' ').trim(), 24)} · ` : ''
  const signalTitle = signals.pageTitle && !GENERIC_TITLE_RE.test(signals.pageTitle) ? signals.pageTitle : ''
  const titleSeed = signalTitle || `${hintPrefix}${scene.label}`
  const title = sanitizeTitle(titleSeed || scene.label)

  const sceneDescriptionMap: Record<string, string> = {
    transit: '基于公交/地铁路径规划结果，展示路线、换乘信息与出行时长。',
    drive: '基于驾车路径规划结果，展示起终点、路线轨迹与里程耗时。',
    admin: '加载行政区划边界数据并进行区域轮廓可视化展示。',
    poi: '在指定范围内检索并展示关键 POI 点位及属性信息。',
    geocode: '通过地理编码与逆地理编码能力实现地址与坐标定位。',
    heatmap: '使用空间热力分布展示重点区域的数据密度与趋势。',
    marker: '在地图上展示核心点位标注，并提供交互信息提示。',
    polygon: '展示 GeoJSON 面数据并结合状态字段进行专题表达。',
    base: '基于天地图 JS API 生成的可交互地图页面快照。',
  }
  const endpointHint = signals.apiEndpoints.length
    ? `主要接口：${signals.apiEndpoints.slice(0, 3).join('、')}。`
    : ''
  const phraseHint = signals.chinesePhrases.length
    ? `关键要素：${signals.chinesePhrases.slice(0, 3).join('、')}。`
    : ''
  const description = sanitizeDescription(`${sceneDescriptionMap[scene.key]}${endpointHint}${phraseHint}`)
  return { title, description, source: 'fallback' }
}

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
    // 分享文案生成固定优先 DeepSeek-V3（速度优先）
    return resolveLlmSelection(
      { provider: 'deepseek', model: 'DeepSeek-V3' },
      fallback,
    )
  } catch {
    return fallback
  }
}

export class ShareSuggestionService {
  private readonly llmSelection: LlmSelection
  private readonly tiandituToken?: string

  constructor(options?: { llmSelection?: LlmSelection; tiandituToken?: string }) {
    this.llmSelection = options?.llmSelection || buildDefaultSelection()
    this.tiandituToken = options?.tiandituToken || config.tiandituToken
  }

  async suggest(input: ShareSuggestionInput): Promise<ShareSuggestionResult> {
    const code = trimText(input.code)
    const hint = clampChars(trimText(input.hint), MAX_HINT_CHARS)
    if (!code) throw new Error('分享代码不能为空')

    const fallback = fallbackSuggestion({ code, hint })
    if (!config.llm.apiKey) return fallback

    const redactedCode = redactCodeForPrompt(code, this.tiandituToken)
    const truncatedCode = clampChars(redactedCode, MAX_CODE_CHARS)
    const signals = extractCodeSignals(redactedCode)
    const scene = detectScene(`${hint}\n${signals.pageTitle}\n${signals.headings.join(' ')}`).label

    const systemPrompt = [
      '你是地图分享文案助手。',
      '请根据任务 prompt 与当前地图页面代码，生成一个简洁中文标题和描述。',
      '标题和描述必须与当前地图页面实际内容强相关，优先使用代码中的业务实体（专题名、地名、图层/指标名称）。',
      '禁止输出与页面无关的泛化文案。',
      `硬性约束：标题 <= ${MAX_TITLE_CHARS} 字符，描述 <= ${MAX_DESCRIPTION_CHARS} 字符。`,
      '只输出 JSON，不要输出 Markdown，不要代码块，不要额外解释。',
      '输出格式：{"title":"...","description":"..."}',
    ].join('\n')

    const userPrompt = [
      `场景判定: ${scene}`,
      `任务Prompt（用户需求）: ${hint || '（无，需主要依据代码内容生成）'}`,
      signals.pageTitle ? `代码<title>: ${signals.pageTitle}` : '代码<title>: （无）',
      signals.headings.length ? `页面标题文本: ${signals.headings.join(' | ')}` : '页面标题文本: （无）',
      signals.apiEndpoints.length ? `主要接口调用: ${signals.apiEndpoints.join('、')}` : '主要接口调用: （无）',
      signals.chinesePhrases.length ? `代码关键词: ${signals.chinesePhrases.join('、')}` : '代码关键词: （无）',
      '当前系统代码（已脱敏，必要时截断）:',
      truncatedCode,
    ].join('\n\n')

    try {
      const llm = createLLM({
        temperature: 0.4,
        maxTokens: 280,
        timeoutMs: Math.min(config.llm.requestTimeoutMs, 20000),
        llmSelection: this.llmSelection,
      })
      const response = await llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ])

      const content = typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content)

      const parsed = parseSuggestionJson(content)
      const title = sanitizeTitle(parsed?.title || '')
      const description = sanitizeDescription(parsed?.description || '')
      if (!title || !description) return fallback

      return {
        title,
        description,
        source: 'ai',
      }
    } catch {
      return fallback
    }
  }
}
