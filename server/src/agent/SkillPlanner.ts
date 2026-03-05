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
  parseFailed?: boolean
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
    const parseFailed = parsed?.__parseFailed === true
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

    const uiSteered = this.trySteerUiDesignSelection(params)
    if (uiSteered) return uiSteered

    const coreMapSteered = this.trySteerCoreMapSkillSelection(params)
    if (coreMapSteered) return coreMapSteered

    const steered = this.trySteerEchartsSelection(params)
    if (steered) return steered

    const intentHints = this.buildIntentHints(params)

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
- 你会收到“高置信意图提示（仅建议）”；这些提示是推荐信号，用于帮助你减少误选
- 修复模式特例：
  - 第一优先：先读取 error-solution 的错误分类文档（error-taxonomy），再决定领域技能
  - 如果错误包含 "GeoJSON" / "数据格式" / "valid GeoJSON object"，优先考虑 bindGeoJSON
  - 不要优先选择 coordinate-transform，除非错误明确提到 EPSG / 3857 / projection / 坐标系
  - 文件上下文若包含 "GeoJSON提取路径"，这通常是数据包装结构问题而不是坐标系问题
- ECharts 相关特例（重要）：
  - bindEcharts 只负责“地图 + 图表联动桥接”（布局、事件、图表更新时机），不负责复杂图表 option 细节
  - 如果用户明确要求某类图表（折线/柱状/饼图/散点/雷达/仪表盘）或强调 option/series/dataZoom 等图表配置，通常还需要读取 "echarts-index" 或一个具体 "echarts-*" 示例
  - 如果图表类型不明确，优先先读 "echarts-index"
- UI 设计特例（重要）：
  - 若用户明确说“页面丑/优化UI/改版首页/布局不好看/视觉风格要提升”，优先先读 UI 规划文档（ui-planning-workflow）
  - 涉及布局结构时再补 tianditu-layout-recipes；涉及配色/字体/间距时补 visual-style-system；涉及细节打磨时补 component-polish-checklist
  - 先规划后编码，不要直接 generate 粗糙页面

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
      intentHints.length ? `\n## 高置信意图提示（仅建议）\n${intentHints.map((h) => `- ${h}`).join('\n')}` : '',
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
    const parseFailed = parsed?.__parseFailed === true
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

    if (parseFailed) {
      const forced = this.trySteerCoreMapSkillSelection(params)
      if (forced) {
        return {
          ...forced,
          reason: `规划器返回非 JSON，启用稳态兜底：${forced.reason}`,
          parseFailed: true,
        }
      }
    }

    // 无有效新 skill 时退化为 generate，避免死循环
    if (action === 'read_skill_docs' && skillNames.length === 0) {
      return {
        action: 'generate',
        reason: reason || '模型未提供有效的新 skill 列表，直接进入生成阶段。',
        raw,
        parseFailed,
      }
    }

    return { action, skillNames, reason, raw, parseFailed }
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
- 涉及页面视觉改版/UI 优化/布局重构时，优先选择 ui-planning-workflow，并按需补充 tianditu-layout-recipes / visual-style-system / component-polish-checklist

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

  private trySteerUiDesignSelection(params: {
    userInput: string
    loadedSkills: string[]
    conversationHistory?: string
    existingCode?: string
    fileData?: string
    runtimeError?: string
    mode?: 'generate' | 'fix'
    llmSelection?: LlmSelection
  }): SkillToolLoopDecision | null {
    if (params.mode === 'fix') return null

    const text = [
      params.userInput || '',
      params.conversationHistory || '',
      params.runtimeError || '',
      params.existingCode?.slice(0, 1200) || '',
    ].join('\n')

    const lower = text.toLowerCase()

    const hasUiIntent = /页面丑|太丑|优化ui|优化界面|美观|视觉风格|改版|重设计|布局不对|排版|卡片样式|页面设计|设计系统|ui/.test(lower)
      || /页面丑|太丑|优化UI|优化界面|美观|视觉风格|改版|重设计|布局不对|排版|卡片样式|页面设计|设计系统/.test(text)
    const hasMapBuildIntent = /创建|生成|实现|做一个|帮我做|可视化|标注|绘制|加载|展示|在地图上|地图/.test(text)
      || /create|generate|build|visualize|marker|map|plot|render/.test(lower)
    const hasDataIntent = !!params.fileData
      || /geojson|featurecollection|上传|文件|点数据|面数据|线数据|data/.test(lower)

    // 策略：
    // 1) 用户明确提 UI，必读 UI 规划文档
    // 2) 默认地图生成任务也先读一次轻量 UI 规划（先规划后编码）
    // 3) 纯问答/排错不触发 UI 规划，避免噪声
    const shouldApplyUiPlanning = hasUiIntent
    if (!shouldApplyUiPlanning) return null

    const available = new Set(this.skillStore.getSkillNames())
    const loaded = new Set(params.loadedSkills)

    const uiPlanning = resolveSkillByRefName(available, 'ui-planning-workflow')
    const layoutRecipes = resolveSkillByRefName(available, 'tianditu-layout-recipes')
    const visualSystem = resolveSkillByRefName(available, 'visual-style-system')
    const polishChecklist = resolveSkillByRefName(available, 'component-polish-checklist')

    const batch: string[] = []
    const pushIfNeeded = (skillName: string | null) => {
      if (!skillName) return
      if (loaded.has(skillName)) return
      if (batch.includes(skillName)) return
      batch.push(skillName)
    }

    pushIfNeeded(uiPlanning)

    const hasCoreSkillLoaded = params.loadedSkills.some((s) => isCoreMapSkill(s))
    if ((hasMapBuildIntent || hasDataIntent) && !hasCoreSkillLoaded) {
      pushIfNeeded(resolveSkillByRefName(available, 'map-init'))
      if (hasDataIntent) pushIfNeeded(resolveSkillByRefName(available, 'bindGeoJSON'))

      if (/点数据|点位|marker|point|中心分布|坐标点|pointlayer/.test(lower)) {
        pushIfNeeded(resolveSkillByRefName(available, 'bindPointLayer'))
      } else if (/轨迹|路径|line|string|线图层/.test(lower)) {
        pushIfNeeded(resolveSkillByRefName(available, 'bindLineLayer'))
      } else if (/地块|面|polygon|fill|区域/.test(lower)) {
        pushIfNeeded(resolveSkillByRefName(available, 'bindPolygonLayer'))
      }
    }

    if (/首页|卡片|hero|landing|入口页/.test(lower) || /首页|卡片/.test(text)) {
      pushIfNeeded(layoutRecipes)
    }
    if (/配色|字体|视觉|风格|品牌|主题|token|css变量/.test(lower) || /配色|字体|视觉|风格|品牌|主题|变量/.test(text)) {
      pushIfNeeded(visualSystem)
    }
    if (/细节|打磨|对齐|hover|focus|loading|empty|error|状态/.test(lower) || /细节|打磨|对齐|状态/.test(text)) {
      pushIfNeeded(polishChecklist)
    }

    // 对“普通地图生成请求”（如标注点/热力图/路线）补一个默认视觉系统，避免产出过于朴素
    if (!hasUiIntent && hasMapBuildIntent) {
      pushIfNeeded(visualSystem)
    }

    if (batch.length > 0) {
      const reason = hasUiIntent
        ? (batch.length > 1
          ? '检测到明确 UI 优化诉求，本轮先读取 UI 规划文档并补充布局/视觉打磨文档，再进入生成。'
          : '检测到明确 UI 设计诉求，先读取 ui-planning-workflow 做“先规划后编码”。')
        : '检测到地图生成任务，按默认策略先做一轮轻量 UI 规划（ui-planning-workflow + visual-style-system），再进入功能代码生成。'

      return {
        action: 'read_skill_docs',
        skillNames: batch,
        reason,
        raw: '[steering] ui design intent -> ui planning docs',
      }
    }

    return null
  }

  private trySteerCoreMapSkillSelection(params: {
    userInput: string
    loadedSkills: string[]
    conversationHistory?: string
    existingCode?: string
    fileData?: string
    runtimeError?: string
    mode?: 'generate' | 'fix'
    llmSelection?: LlmSelection
  }): SkillToolLoopDecision | null {
    if (params.mode === 'fix') return null

    const text = [
      params.userInput || '',
      params.conversationHistory || '',
      params.existingCode?.slice(0, 1200) || '',
    ].join('\n')
    const lower = text.toLowerCase()

    const hasMapIntent = /地图|map|可视化|渲染|加载|展示|标注|点数据|geojson|地理|图层|marker|layer/.test(text)
    if (!hasMapIntent) return null

    const available = new Set(this.skillStore.getSkillNames())
    const loaded = new Set(params.loadedSkills)
    const hasCoreSkillLoaded = params.loadedSkills.some((s) => isCoreMapSkill(s))
    if (hasCoreSkillLoaded) return null

    const batch: string[] = []
    const pushIfNeeded = (skillName: string | null) => {
      if (!skillName) return
      if (loaded.has(skillName)) return
      if (batch.includes(skillName)) return
      batch.push(skillName)
    }

    pushIfNeeded(resolveSkillByRefName(available, 'map-init'))

    const hasDataIntent = !!params.fileData
      || /geojson|上传|文件|数据|rawdata|featurecollection|点数据/.test(lower)
    if (hasDataIntent) {
      pushIfNeeded(resolveSkillByRefName(available, 'bindGeoJSON'))
    }

    if (/点数据|点位|marker|point|中心分布|坐标点|pointlayer/.test(lower)) {
      pushIfNeeded(resolveSkillByRefName(available, 'bindPointLayer'))
    } else if (/轨迹|路径|line|string|线图层/.test(lower)) {
      pushIfNeeded(resolveSkillByRefName(available, 'bindLineLayer'))
    } else if (/地块|面|polygon|fill|区域/.test(lower)) {
      pushIfNeeded(resolveSkillByRefName(available, 'bindPolygonLayer'))
    }

    if (/列表|筛选|联动|点击|hover|详情|popup|交互/.test(lower)) {
      pushIfNeeded(resolveSkillByRefName(available, 'bindEvents'))
      pushIfNeeded(resolveSkillByRefName(available, 'popup'))
    }

    const picked = batch.filter(Boolean).slice(0, 4)
    if (!picked.length) return null

    return {
      action: 'read_skill_docs',
      skillNames: picked,
      reason: `当前仅有规划/样式类上下文，不足以保证地图功能正确；补充读取核心地图技能：${picked.join(', ')}。`,
      raw: '[steering] force core map skills before generate',
    }
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
    const adminSkill = resolveSkillByRefName(available, 'search-admin')
    const geocoderSkill = resolveSkillByRefName(available, 'geocoder')
    const routeSkill = resolveSkillByRefName(available, 'search-route')
    const transitSkill = resolveSkillByRefName(available, 'search-transit')

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

    if (/geocoder|地理编码|逆地理|reverse-geocode|poststr|ds=|address=/.test(text)) {
      pushIfNeeded(geocoderSkill)
      pushIfNeeded(playbookSkill)
    }

    if (/drive|驾车|路径规划|routelatlon|orig|dest|style=/.test(text)) {
      pushIfNeeded(routeSkill)
      pushIfNeeded(playbookSkill)
    }

    if (/transit|busline|公交|地铁|换乘|linetype/.test(text)) {
      pushIfNeeded(transitSkill)
      pushIfNeeded(playbookSkill)
    }

    // 行政区划相关错误：优先补充 search-admin，避免把行政边界问题误判为纯 GeoJSON 问题
    if (
      /administrative|\/api\/tianditu\/administrative|\/v2\/administrative|行政区|行政边界|district|childlevel|extensions|boundary|wkt|multipolygon|failed to parse url from \/api\/tianditu\/administrative/.test(text)
    ) {
      pushIfNeeded(adminSkill)
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

  private buildIntentHints(params: {
    userInput: string
    loadedSkills: string[]
    conversationHistory?: string
    existingCode?: string
    fileData?: string
    runtimeError?: string
    mode?: 'generate' | 'fix'
    llmSelection?: LlmSelection
  }): string[] {
    const hints: string[] = []
    const text = [
      params.userInput || '',
      params.conversationHistory || '',
      params.runtimeError || '',
      params.existingCode?.slice(0, 1600) || '',
    ].join('\n')
    const lower = text.toLowerCase()
    const loaded = new Set(params.loadedSkills)

    const hasAdminIntent = /行政区|行政区划|行政边界|省界|市界|区县边界|v2\/administrative|childlevel|extensions|district|boundary|gb编码|国标码|江苏省/.test(text)
      || /\/api\/tianditu\/administrative/.test(lower)
    if (hasAdminIntent && !loaded.has('search-admin')) {
      hints.push('检测到行政区划边界/层级查询意图：建议优先读取 search-admin；仅当需要渲染层时再补 bindPolygonLayer 或 bindGeoJSON。')
    }

    const hasSearchV2Intent = /地名搜索|视野内搜索|周边搜索|多边形搜索|querytype|v2\/search|specify|datatypes|queryradius|pointlonlat/.test(text)
    if (hasSearchV2Intent && !loaded.has('search-v2')) {
      hints.push('检测到地名搜索 V2.0 意图：建议读取 search-v2 以获得正确 queryType 参数组合。')
    }

    const hasTransitIntent = /公交|地铁|换乘|transit|busline|linetype|startposition|endposition/.test(text)
    if (hasTransitIntent && !loaded.has('search-transit')) {
      hints.push('检测到公交/地铁规划意图：建议读取 search-transit，避免误用驾车或 GeoJSON 技能。')
    }

    const hasDriveIntent = /驾车|开车|路线规划|drive|orig|dest|routelatlon/.test(text)
    if (hasDriveIntent && !loaded.has('search-route')) {
      hints.push('检测到驾车路线规划意图：建议读取 search-route，并优先使用 /api/tianditu/drive。')
    }

    const hasGeocoderIntent = /地理编码|逆地理|地址转坐标|坐标转地址|geocoder|reverse-geocode/.test(text)
    if (hasGeocoderIntent && !loaded.has('geocoder')) {
      hints.push('检测到地理编码意图：建议读取 geocoder，避免误用 /v5/geocoder 或 address= 参数。')
    }

    const hasUiDesignIntent = /页面丑|太丑|优化ui|优化界面|美观|视觉风格|改版|重设计|布局不对|排版|卡片样式|页面设计|设计系统|ui/.test(lower)
      || /页面丑|太丑|优化UI|优化界面|美观|视觉风格|改版|重设计|布局不对|排版|卡片样式|页面设计|设计系统/.test(text)
    if (hasUiDesignIntent) {
      const hasUiPlanning = loaded.has('ui-planning-workflow')
      if (!hasUiPlanning) {
        hints.push('检测到页面视觉优化意图：建议先读 ui-planning-workflow，再按需补充 tianditu-layout-recipes / visual-style-system。')
      } else if (!loaded.has('component-polish-checklist')) {
        hints.push('已进入 UI 规划阶段：可补读 component-polish-checklist，完善 hover/focus/loading/empty/error 等细节状态。')
      }
    }

    return hints
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

function isCoreMapSkill(name: string): boolean {
  return (
    name === 'map-init' ||
    name === 'bindGeoJSON' ||
    name === 'bindPointLayer' ||
    name === 'bindLineLayer' ||
    name === 'bindPolygonLayer' ||
    name === 'marker' ||
    name === 'popup' ||
    name === 'bindEvents' ||
    name === 'search-poi' ||
    name === 'search-route' ||
    name === 'search-transit' ||
    name === 'search-admin'
  )
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
    const parsed = safeJsonParse(fenced[1].trim())
    if (parsed != null) return parsed
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

  return { selected_skills: [], reason: 'LLM 返回非 JSON，已视为未选择 skill。', raw, __parseFailed: true }
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
