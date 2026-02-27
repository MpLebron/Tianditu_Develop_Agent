import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { createLLM } from '../llm/createLLM.js'
import type { LlmSelection } from '../provider/index.js'
import type { SkillStore } from './SkillStore.js'

export interface SkillPlannerDecision {
  selectedSkills: string[]
  reason: string
  raw: string
}

export interface SkillToolLoopDecision {
  action: 'read_skill_docs' | 'generate'
  skillNames?: string[]
  reason: string
  raw: string
}

/**
 * 参考 OpenClaw 的技能选择模式：
 * - 先给模型 available_skills（name/description/location）
 * - 由模型决定是否选择 skill 以及选择哪个 skill
 * - 后端只做白名单校验与兜底
 */
export class SkillPlanner {
  constructor(private skillStore: SkillStore) {}

  async selectSkills(params: {
    userInput: string
    conversationHistory?: string
    existingCode?: string
    fileData?: string
    maxSkills?: number
    llmSelection?: LlmSelection
  }): Promise<SkillPlannerDecision> {
    const totalSkills = this.skillStore.getSkillNames().length
    const requestedMax = params.maxSkills ?? totalSkills
    const maxSkills = Math.min(Math.max(requestedMax, 0), totalSkills)
    const systemPrompt = this.buildSystemPrompt({ maxSkills })
    const userPrompt = this.buildUserPrompt(params)

    const llm = createLLM({ temperature: 0, maxTokens: 800, llmSelection: params.llmSelection })
    const response = await llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ])

    const raw = extractTextContent(response.content).trim()
    const parsed = parsePlannerJson(raw)
    const allowed = new Set(this.skillStore.getSkillNames())

    const selectedSkills = dedupe(
      normalizeSkillSelection(parsed).filter((name) => allowed.has(name)),
    ).slice(0, maxSkills)

    const reason = typeof parsed.reason === 'string'
      ? parsed.reason.trim()
      : typeof parsed.rationale === 'string'
        ? parsed.rationale.trim()
        : ''

    return { selectedSkills, reason, raw }
  }

  /**
   * OpenClaw 风格 inner loop：
   * 模型每轮决定“再读一组 skill 文档”或“开始生成”。
   */
  async decideNextAction(params: {
    userInput: string
    loadedSkills: string[]
    conversationHistory?: string
    existingCode?: string
    fileData?: string
    runtimeError?: string
    mode?: 'generate' | 'fix'
    llmSelection?: LlmSelection
  }): Promise<SkillToolLoopDecision> {
    const fixSteered = this.trySteerFixErrorSelection(params)
    if (fixSteered) return fixSteered

    const steered = this.trySteerEchartsSelection(params)
    if (steered) return steered

    const systemPrompt = `你是一个 Agent 工具调度器（skills 文档读取阶段）。
你的目标是在“开始生成代码/回答”之前，决定是否还需要读取一个 skill 文档。

你每次只能做一个动作：
- read_skill_docs：再读取一组最有价值的 skill 文档（可 1~N 个）
- generate：当前已获取的信息足够，进入生成阶段

规则（参考 OpenClaw 的工具循环思想）：
- 先看用户请求，再看已加载的 skill 列表
- 若请求是复合任务，可一次性补充多个 skill
- 不要重复读取已加载的 skill
- 若已加载技能足以覆盖请求，选择 generate
- 只能从 <available_skills> 中选择 skill 名
- 修复模式特例：
  - 第一优先：先读取 error-solution 的错误分类文档（error-taxonomy），再决定领域技能
  - 如果错误包含 "GeoJSON" / "数据格式" / "valid GeoJSON object"，优先考虑 bindGeoJSON
  - 不要优先选择 coordinate-transform，除非错误明确提到 EPSG / 3857 / projection / 坐标系
  - 文件上下文若包含 "GeoJSON提取路径"，这通常是数据包装结构问题而不是坐标系问题
- ECharts 相关特例（重要）：
  - bindEcharts 只负责“地图 + 图表联动桥接”（布局、事件、图表更新时机），不负责复杂图表 option 细节
  - 如果用户明确要求某类图表（折线/柱状/饼图/散点/雷达/仪表盘）或强调 option/series/dataZoom 等图表配置，通常还需要读取 "echarts-index" 或一个具体 "echarts-*" 示例
  - 如果图表类型不明确，优先先读 "echarts-index"

输出规则：
- 只输出 JSON
- 格式：
  - {"action":"read_skill_docs","skills":["bindEvents"],"reason":"需要事件交互能力"}
  - {"action":"read_skill_docs","skills":["bindGeoJSON","bindPolygonLayer"],"reason":"同时需要数据加载与面图层渲染"}
  - {"action":"generate","reason":"已具备地图初始化、数据加载和热力图能力"}`

    const userPrompt = [
      `## 阶段\n${params.mode === 'fix' ? '代码修复阶段' : '生成阶段'}`,
      '## 当前请求',
      params.userInput || (params.mode === 'fix' ? '自动修复地图运行错误' : ''),
      params.runtimeError ? `\n## 运行错误（修复阶段）\n${params.runtimeError.slice(0, 1200)}` : '',
      params.conversationHistory ? `\n## 对话历史（截断）\n${params.conversationHistory.slice(-1200)}` : '',
      params.existingCode ? '\n## 已有代码\n用户正在基于现有代码继续修改。' : '',
      params.fileData ? '\n## 上传文件\n存在上传文件，可能需要数据加载类 skill。' : '',
      `\n## 已加载技能 (${params.loadedSkills.length})`,
      params.loadedSkills.length ? params.loadedSkills.map((s) => `- ${s}`).join('\n') : '- （暂无）',
      '\n## 可用技能列表',
      this.skillStore.getPlannerCatalog(),
    ].filter(Boolean).join('\n')

    const llm = createLLM({ temperature: 0, maxTokens: 800, llmSelection: params.llmSelection })
    const response = await llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ])

    const raw = extractTextContent(response.content).trim()
    const parsed = parsePlannerJson(raw)
    const allowed = new Set(this.skillStore.getSkillNames())

    const actionRaw = typeof parsed.action === 'string' ? parsed.action.trim().toLowerCase() : ''
    const action: 'read_skill_docs' | 'generate' =
      actionRaw === 'read_skill_doc' || actionRaw === 'read_skill_docs' ? 'read_skill_docs' : 'generate'

    const requestedSkillNames = normalizeDecisionSkillSelection(parsed)
    const skillNames = action === 'read_skill_docs'
      ? dedupe(
        requestedSkillNames
          .filter((name) => allowed.has(name))
          .filter((name) => !params.loadedSkills.includes(name)),
      )
      : []

    const reason = typeof parsed.reason === 'string'
      ? parsed.reason.trim()
      : typeof parsed.rationale === 'string'
        ? parsed.rationale.trim()
        : ''

    // 无有效新 skill 时退化为 generate，避免死循环
    if (action === 'read_skill_docs' && skillNames.length === 0) {
      return {
        action: 'generate',
        reason: reason || '模型未提供有效的新 skill 列表，直接进入生成阶段。',
        raw,
      }
    }

    return { action, skillNames, reason, raw }
  }

  private buildSystemPrompt(params: { maxSkills: number }): string {
    return `你是一个 Skill 选择器。任务是根据用户请求，从可用技能列表中选择最适合先读取的技能文档。

参考 OpenClaw 的策略（关键）：
- 先扫描 <available_skills> 中每个 skill 的 <description>
- 必须先确定“主 skill”（最直接解决当前请求的那个）
- 如果请求明显是复合任务（例如：地图初始化 + 数据加载 + 图层渲染 / 搜索 / 路径规划 / 事件交互 / ECharts 联动），可以再补充 1~2 个“辅助 skill”
- 如果多个都可能适用：优先选择更具体、更贴近用户动作的 skill，而不是泛化 skill
- 如果没有明显适用：不选择任何 skill
- 不要臆造 skill 名称；只能从 <available_skills> 中选择

本项目约束（非常重要）：
- 当前后端会在生成前一次性预加载你选择的 skill 文档，不支持像 OpenClaw 那样在后续轮次继续 read 更多 skill
- 因此如果你判断需要多个技能配合，请在这一步一次性选出（不设固定数量上限）
- 但不要贪多：无关 skill 会增加噪声，影响代码质量

选择建议（优先级）：
- 新建地图类请求，通常需要 map-init 作为主 skill
- 上传文件/GeoJSON/CSV/Excel 渲染，通常还需要 bindGeoJSON 或具体图层 skill（点/线/面/heatmap/cluster）
- 搜索/地理编码/路径规划类请求，优先选对应 search-* / geocoder
- 涉及交互点击悬停时，可补充 bindEvents
- 涉及图表联动时，优先选择 bindEcharts（联动桥接）；若用户明确要求图表类型/图表样式/option/series 配置，必须再补 "echarts-index" 或 1 个具体 "echarts-*" 示例（bindEcharts 本身不包含足够的图表本体配置）

输出规则：
- 只输出 JSON，不要输出 Markdown，不要解释
- JSON 字段：
  - selected_skills: string[]  // 按“主 → 辅助”排序
  - reason: string             // 简短说明选择原因

示例：
{"selected_skills":["map-init"],"reason":"用户要创建基础地图，map-init 最直接相关。"}
{"selected_skills":["map-init","bindGeoJSON","bindHeatmap"],"reason":"请求包含地图初始化、GeoJSON 数据加载和热力图渲染，需组合多个技能。"}`
  }

  private buildUserPrompt(params: {
    userInput: string
    conversationHistory?: string
    existingCode?: string
    fileData?: string
  }): string {
    const parts: string[] = []
    parts.push('## 当前请求')
    parts.push(params.userInput)

    if (params.conversationHistory) {
      parts.push('\n## 对话历史（截断）')
      parts.push(params.conversationHistory.slice(-1500))
    }

    if (params.existingCode) {
      parts.push('\n## 已有代码（存在）')
      parts.push('用户当前在修改已有地图代码。')
    }

    if (params.fileData) {
      parts.push('\n## 上传文件（存在）')
      parts.push('用户附带了数据文件，可能需要数据加载/GeoJSON/图层类 skill。')
    }

    parts.push('\n## 可用技能列表')
    parts.push(this.skillStore.getPlannerCatalog())

    return parts.join('\n')
}

  private trySteerEchartsSelection(params: {
    userInput: string
    loadedSkills: string[]
    conversationHistory?: string
    existingCode?: string
    fileData?: string
    runtimeError?: string
    mode?: 'generate' | 'fix'
    llmSelection?: LlmSelection
  }): SkillToolLoopDecision | null {
    const text = [
      params.userInput || '',
      params.conversationHistory || '',
      params.runtimeError || '',
      params.existingCode?.slice(0, 1200) || '',
    ].join('\n')

    const chartIntent = detectEchartsIntent(text)
    if (!chartIntent.hasEcharts) return null

    const loaded = new Set(params.loadedSkills)
    const available = new Set(this.skillStore.getSkillNames())
    const hasBridge = loaded.has('bindEcharts')
    const hasIndex = loaded.has('echarts-index')
    const hasChartExample = params.loadedSkills.some((s) => /^echarts-(line|bar|pie|scatter|radar|gauge)-/.test(s))

    if (chartIntent.isMapChartTask && !hasBridge && available.has('bindEcharts')) {
      const batch = ['bindEcharts']
      if ((chartIntent.explicitChartType || chartIntent.needsChartOption) && !hasChartExample) {
        const specific = pickEchartsExampleByType(chartIntent.explicitChartType, available, loaded)
        if (specific) batch.push(specific)
        else if (!hasIndex && available.has('echarts-index')) batch.push('echarts-index')
      }
      return {
        action: 'read_skill_docs',
        skillNames: batch,
        reason: batch.length > 1
          ? '检测到地图+图表联动且存在图表配置需求，本轮同时读取桥接文档与图表文档。'
          : '检测到地图与图表联动任务，先读取桥接文档 bindEcharts 处理布局、事件绑定与图表更新时机。',
        raw: '[steering] map+echarts -> batch docs',
      }
    }

    if ((chartIntent.explicitChartType || chartIntent.needsChartOption) && !hasChartExample) {
      const specific = pickEchartsExampleByType(chartIntent.explicitChartType, available, loaded)
      if (specific) {
        return {
          action: 'read_skill_docs',
          skillNames: [specific],
          reason: `检测到明确图表类型/option 需求（${chartIntent.explicitChartTypeLabel}），补充读取具体 ECharts 示例以提供可复用 option 结构。`,
          raw: '[steering] echarts explicit chart type -> specific example',
        }
      }
      if (!hasIndex && available.has('echarts-index')) {
        return {
          action: 'read_skill_docs',
          skillNames: ['echarts-index'],
          reason: '检测到 ECharts 图表配置需求，但图表类型未能精确匹配示例，先读取 echarts-index 选择最接近的图表示例。',
          raw: '[steering] echarts -> echarts-index',
        }
      }
    }

    // 已读桥接文档但还没读任何图表本体文档时，不要过早 generate
    if (hasBridge && !hasIndex && !hasChartExample && available.has('echarts-index')) {
      return {
        action: 'read_skill_docs',
        skillNames: ['echarts-index'],
        reason: 'bindEcharts 仅覆盖联动桥接逻辑，仍需读取 echarts-index 选择图表本体示例后再生成。',
        raw: '[steering] bindEcharts-only -> read echarts-index',
      }
    }

    return null
  }

  private trySteerFixErrorSelection(params: {
    userInput: string
    loadedSkills: string[]
    conversationHistory?: string
    existingCode?: string
    fileData?: string
    runtimeError?: string
    mode?: 'generate' | 'fix'
    llmSelection?: LlmSelection
  }): SkillToolLoopDecision | null {
    if (params.mode !== 'fix') return null

    const runtimeError = String(params.runtimeError || '')
    const userInput = String(params.userInput || '')
    const text = `${runtimeError}\n${userInput}`.toLowerCase()
    if (!text.trim()) return null

    const available = new Set(this.skillStore.getSkillNames())
    const loaded = new Set(params.loadedSkills)

    const taxonomySkill = resolveSkillByRefName(available, 'error-taxonomy')
    const tiandituErrSkill = resolveSkillByRefName(available, 'tianditu-common-errors')
    const jsRuntimeSkill = resolveSkillByRefName(available, 'javascript-runtime-errors')
    const networkSkill = resolveSkillByRefName(available, 'fetch-xhr-errors')
    const playbookSkill = resolveSkillByRefName(available, 'fix-playbook')
    const geojsonSkill = resolveSkillByRefName(available, 'bindGeoJSON')

    const hasErrorSolutionDoc = params.loadedSkills.some((s) => isErrorSolutionSkill(s))

    // 修复阶段第一步：先加载错误分类文档
    if (!hasErrorSolutionDoc && taxonomySkill && !loaded.has(taxonomySkill)) {
      return {
        action: 'read_skill_docs',
        skillNames: [taxonomySkill],
        reason: '修复阶段优先读取错误分类文档，先确定错误类型与根因，再决定后续修复技能。',
        raw: '[steering] fix first read error-taxonomy',
      }
    }

    const batch: string[] = []
    const pushIfNeeded = (skillName: string | null) => {
      if (!skillName) return
      if (loaded.has(skillName)) return
      if (batch.includes(skillName)) return
      batch.push(skillName)
    }

    if (/identifier .* has already been declared|syntaxerror|unexpected token|cannot read properties of undefined|is not a function/.test(text)) {
      pushIfNeeded(jsRuntimeSkill)
      pushIfNeeded(playbookSkill)
    }

    if (/ajaxerror|fetcherror|404|500|network|cors|not found|timeout|failed to fetch/.test(text)) {
      pushIfNeeded(networkSkill)
      pushIfNeeded(tiandituErrSkill)
      pushIfNeeded(playbookSkill)
    }

    if (/geojson|featurecollection|valid geojson|数据格式|无法识别的数据格式/.test(text)) {
      pushIfNeeded(geojsonSkill)
      pushIfNeeded(tiandituErrSkill)
      pushIfNeeded(playbookSkill)
    }

    if (/style:\s*['"]default['"]|not found \(404\): default/.test(text)) {
      pushIfNeeded(tiandituErrSkill)
      pushIfNeeded(playbookSkill)
    }

    if (batch.length === 0 && playbookSkill && !loaded.has(playbookSkill)) {
      batch.push(playbookSkill)
    }

    if (batch.length > 0) {
      return {
        action: 'read_skill_docs',
        skillNames: batch,
        reason: '检测到运行错误，先补充对应错误解决文档与修复流程文档，再进入代码修复。',
        raw: '[steering] fix read error-solution and related docs',
      }
    }

    return null
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

function resolveSkillByRefName(available: Set<string>, refName: string): string | null {
  if (available.has(refName)) return refName
  for (const name of available) {
    if (name.endsWith(`/${refName}`)) return name
  }
  return null
}

function isErrorSolutionSkill(name: string): boolean {
  return (
    name === 'error-taxonomy' ||
    name === 'tianditu-common-errors' ||
    name === 'javascript-runtime-errors' ||
    name === 'fetch-xhr-errors' ||
    name === 'fix-playbook' ||
    name.startsWith('error-solution/')
  )
}

function normalizeSkillSelection(parsed: any): string[] {
  if (!parsed || typeof parsed !== 'object') return []

  if (Array.isArray(parsed.selected_skills)) {
    return parsed.selected_skills.map(String).map((s: string) => s.trim()).filter(Boolean)
  }
  if (Array.isArray(parsed.selectedSkills)) {
    return parsed.selectedSkills.map(String).map((s: string) => s.trim()).filter(Boolean)
  }
  if (Array.isArray(parsed.skills)) {
    return parsed.skills.map(String).map((s: string) => s.trim()).filter(Boolean)
  }
  if (typeof parsed.skill === 'string' && parsed.skill.trim()) {
    return [parsed.skill.trim()]
  }
  return []
}

function normalizeDecisionSkillSelection(parsed: any): string[] {
  if (!parsed || typeof parsed !== 'object') return []
  if (Array.isArray(parsed.skills)) {
    return parsed.skills.map(String).map((s: string) => s.trim()).filter(Boolean)
  }
  if (Array.isArray(parsed.skillNames)) {
    return parsed.skillNames.map(String).map((s: string) => s.trim()).filter(Boolean)
  }
  if (Array.isArray(parsed.selected_skills)) {
    return parsed.selected_skills.map(String).map((s: string) => s.trim()).filter(Boolean)
  }
  if (typeof parsed.skill === 'string' && parsed.skill.trim()) return [parsed.skill.trim()]
  if (typeof parsed.skillName === 'string' && parsed.skillName.trim()) return [parsed.skillName.trim()]
  return []
}

function parsePlannerJson(raw: string): any {
  const cleaned = raw.trim()
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) {
    return safeJsonParse(fenced[1].trim())
  }

  // 优先直接解析
  const direct = safeJsonParse(cleaned)
  if (direct != null) return direct

  // 再尝试截取首个 JSON 对象
  const objectMatch = cleaned.match(/\{[\s\S]*\}/)
  if (objectMatch) {
    const parsed = safeJsonParse(objectMatch[0])
    if (parsed != null) return parsed
  }

  return { selected_skills: [], reason: 'LLM 返回非 JSON，已视为未选择 skill。', raw }
}

function detectEchartsIntent(text: string): {
  hasEcharts: boolean
  isMapChartTask: boolean
  needsChartOption: boolean
  explicitChartType?: 'line' | 'bar' | 'pie' | 'scatter' | 'radar' | 'gauge'
  explicitChartTypeLabel: string
} {
  const s = text.toLowerCase()
  const hasEcharts = /echarts|图表|option|series|tooltip|legend|datazoom|折线图|柱状图|条形图|饼图|散点图|雷达图|仪表盘/.test(text)
  const isMapChartTask = /天地图|tmapgl|地图|底图|marker|图层|经纬度/.test(text) || /tmapgl\./i.test(text)
  const needsChartOption = /option|series|tooltip|legend|datazoom|图表样式|图表配置/.test(text)

  let explicitChartType: 'line' | 'bar' | 'pie' | 'scatter' | 'radar' | 'gauge' | undefined
  if (/折线图|line\b/.test(text)) explicitChartType = 'line'
  else if (/柱状图|条形图|bar\b/.test(text)) explicitChartType = 'bar'
  else if (/饼图|pie\b/.test(text)) explicitChartType = 'pie'
  else if (/散点图|气泡图|scatter\b/.test(text)) explicitChartType = 'scatter'
  else if (/雷达图|radar\b/.test(text)) explicitChartType = 'radar'
  else if (/仪表盘|gauge\b/.test(text)) explicitChartType = 'gauge'

  const explicitChartTypeLabel = explicitChartType
    ? ({ line: '折线图', bar: '柱状图/条形图', pie: '饼图', scatter: '散点图', radar: '雷达图', gauge: '仪表盘' } as const)[explicitChartType]
    : '未明确图表类型'

  return { hasEcharts, isMapChartTask, needsChartOption, explicitChartType, explicitChartTypeLabel }
}

function pickEchartsExampleByType(
  explicitType: 'line' | 'bar' | 'pie' | 'scatter' | 'radar' | 'gauge' | undefined,
  available: Set<string>,
  loaded: Set<string>,
): string | null {
  if (!explicitType) return null
  const prefix = `echarts-${explicitType}-`
  const candidates = Array.from(available)
    .filter((name) => name.startsWith(prefix) && !loaded.has(name))
    .sort()
  return candidates[0] || null
}

function safeJsonParse(text: string): any | null {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>
          if (typeof obj.text === 'string') return obj.text
          if (typeof obj.content === 'string') return obj.content
        }
        return ''
      })
      .join('')
  }
  if (content && typeof content === 'object') {
    const obj = content as Record<string, unknown>
    if (typeof obj.text === 'string') return obj.text
    if (typeof obj.content === 'string') return obj.content
  }
  return ''
}
