import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { createLLM } from '../llm/createLLM.js'
import { formatPlanningPolicyCards } from './PlanningPolicyCatalog.js'
import { extractTextContent, parseJsonObject } from './PlannerJson.js'
import type { ReferencePlan } from './AgentRuntimeTypes.js'
import type { SkillStore } from './SkillStore.js'

export class ReferencePlanner {
  constructor(private skillStore: SkillStore) {}

  async decide(params: {
    userInput: string
    selectedPackageIds: string[]
    loadedReferences: string[]
    conversationHistory?: string
    existingCode?: string
    fileData?: string
    runtimeError?: string
    mode: 'generate' | 'fix'
  }): Promise<ReferencePlan> {
    const domains = params.selectedPackageIds
      .map((packageId) => this.skillStore.getPackageEntry(packageId)?.domainId)
      .filter((value): value is NonNullable<typeof value> => Boolean(value))

    const systemPrompt = `你是一个 reference planner。

任务：在已选 package 内决定：
1. 还需读取哪些 reference docs
2. 是否可以直接进入 generate/fix 阶段
3. 哪些 contractIds 需要激活

规则：
- 只能从 <available_skills> 里选择 reference
- 不要重复选择已加载 reference
- 能直接生成/修复时，返回 action=generate
- 只输出 JSON

输出格式：
{"action":"read_skill_docs","referenceIds":["jsapi/map-init"],"contractIds":[],"reason":"需要地图初始化 reference","confidence":0.9,"riskFlags":[]}
{"action":"generate","referenceIds":[],"contractIds":["search-v2-poi"],"reason":"已有信息足够，直接生成","confidence":0.84,"riskFlags":[]}`

    const userPrompt = [
      `## 阶段\n${params.mode}`,
      '## 当前请求',
      params.userInput || '',
      params.runtimeError ? `\n## 运行错误\n${params.runtimeError.slice(0, 1200)}` : '',
      params.conversationHistory ? `\n## 对话历史\n${params.conversationHistory.slice(-1200)}` : '',
      params.existingCode ? '\n## 已有代码\n用户正在基于现有代码继续修改。' : '',
      params.fileData ? '\n## 上传文件\n存在上传文件，可能涉及 GeoJSON 或数据渲染。' : '',
      `\n## 已选 package\n${params.selectedPackageIds.join(', ') || '无'}`,
      `\n## 已加载 references\n${params.loadedReferences.join(', ') || '无'}`,
      '',
      formatPlanningPolicyCards({ mode: params.mode, domains }),
      '',
      '## 可用 reference',
      this.skillStore.getPlannerCatalogForPackages(params.selectedPackageIds),
    ].filter(Boolean).join('\n')

    try {
      const llm = createLLM({ temperature: 0, maxTokens: 900 })
      const response = await llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ])
      const raw = extractTextContent(response.content).trim()
      const parsed = parseJsonObject(raw, {
        action: 'generate',
        referenceIds: [],
        contractIds: [],
        reason: '',
        confidence: 0,
        riskFlags: [],
      })
      const requestedReferences = Array.isArray(parsed.referenceIds)
        ? parsed.referenceIds.map(String).map((value) => value.trim()).filter(Boolean)
        : Array.isArray(parsed.skills)
          ? parsed.skills.map(String).map((value) => value.trim()).filter(Boolean)
          : []
      const referenceIds = dedupe(
        requestedReferences
          .map((id) => this.skillStore.resolveAlias(id))
          .filter((id): id is string => Boolean(id))
          .filter((id) => !params.loadedReferences.includes(id)),
      )
      const contractIds = Array.isArray(parsed.contractIds)
        ? dedupe(parsed.contractIds.map(String).map((value) => value.trim()).filter(Boolean))
        : []
      const action = String(parsed.action || '').toLowerCase() === 'read_skill_docs' ? 'read_skill_docs' : 'generate'

      if (action === 'generate' || referenceIds.length > 0) {
        return {
          action: action === 'read_skill_docs' && referenceIds.length === 0 ? 'generate' : action,
          referenceIds,
          contractIds,
          packageIds: params.selectedPackageIds,
          reason: typeof parsed.reason === 'string' ? parsed.reason.trim() : '',
          confidence: normalizeConfidence(parsed.confidence),
          riskFlags: Array.isArray(parsed.riskFlags)
            ? parsed.riskFlags.map(String).map((value) => value.trim()).filter(Boolean)
            : [],
          raw,
          decisionSource: 'llm',
          parseFailed: parsed.__parseFailed === true,
        }
      }

      return this.fallback(params, raw, parsed.__parseFailed === true ? 'parse_failed' : 'empty_refs')
    } catch (error) {
      return this.fallback(params, String(error), 'llm_error')
    }
  }

  private fallback(
    params: {
      userInput: string
      selectedPackageIds: string[]
      loadedReferences: string[]
      fileData?: string
      runtimeError?: string
      mode: 'generate' | 'fix'
    },
    raw: string,
    fallbackReason: string,
  ): ReferencePlan {
    const text = `${params.userInput || ''}\n${params.runtimeError || ''}`.toLowerCase()
    const nextRefs: string[] = []
    const pushIfAvailable = (name: string) => {
      const resolved = this.skillStore.resolveAlias(name)
      if (!resolved || params.loadedReferences.includes(resolved) || nextRefs.includes(resolved)) return
      nextRefs.push(resolved)
    }

    if (params.mode === 'fix') {
      pushIfAvailable('javascript-runtime-errors')
      pushIfAvailable('fix-playbook')
      if (/marker|popup|覆盖物|map\.add|addto|seticon/.test(text)) {
        pushIfAvailable('marker')
        pushIfAvailable('popup')
      }
      if (/geojson|featurecollection|数据格式/.test(text)) pushIfAvailable('bindGeoJSON')
      if (/行政区|boundary|district|wkt|administrative/.test(text)) pushIfAvailable('search-admin')
      if (/geocoder|地理编码|逆地理/.test(text)) pushIfAvailable('geocoder')
      if (/drive|驾车|路线规划/.test(text)) pushIfAvailable('search-route')
      if (/transit|公交|地铁|换乘/.test(text)) pushIfAvailable('search-transit')
      if (params.selectedPackageIds.includes('tianditu-lbs')) {
        pushLbsSceneFallbacks(text, pushIfAvailable)
      }
    } else {
      if (params.selectedPackageIds.includes('tianditu-jsapi')) {
        pushIfAvailable('map-init')
        if (params.fileData || /geojson|featurecollection|数据/.test(text)) pushIfAvailable('bindGeoJSON')
        if (/点位|marker|circle|point/.test(text)) pushIfAvailable('bindPointLayer')
        else if (/轨迹|line|string|路径/.test(text)) pushIfAvailable('bindLineLayer')
        else if (/polygon|面|区域|行政区边界|fill/.test(text)) pushIfAvailable('bindPolygonLayer')
        if (/点击|交互|详情|popup|hover/.test(text)) pushIfAvailable('bindEvents')
      }
      if (params.selectedPackageIds.includes('tianditu-lbs')) {
        pushLbsSceneFallbacks(text, pushIfAvailable)
      }
      if (params.selectedPackageIds.includes('tianditu-ui-design')) pushIfAvailable('ui-planning-workflow')
      if (params.selectedPackageIds.includes('tianditu-echarts-bridge')) pushIfAvailable('bindEcharts')
      if (params.selectedPackageIds.includes('echarts-charts')) pushIfAvailable('echarts-index')
    }

    return {
      action: nextRefs.length ? 'read_skill_docs' : 'generate',
      referenceIds: nextRefs,
      contractIds: [],
      packageIds: params.selectedPackageIds,
      reason: 'LLM 未给出有效 reference 选择，使用声明式 fallback 补足最小必要文档。',
      confidence: 0.58,
      riskFlags: nextRefs.length ? ['fallback-reference-selection'] : ['fallback-direct-generate'],
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

function pushLbsSceneFallbacks(text: string, pushIfAvailable: (name: string) => void) {
  pushIfAvailable('api-overview')

  const explicitCoordinatePattern =
    /\[\s*-?\d{2,3}(?:\.\d+)?\s*,\s*-?\d{1,2}(?:\.\d+)?\s*\]|-?\d{2,3}(?:\.\d+)?\s*,\s*-?\d{1,2}(?:\.\d+)?/
  const hasExplicitCoordinates = explicitCoordinatePattern.test(text)
  const hasNamedRouteConnector = /从.+(?:到|至|->|→)|.+(?:到|至|->|→).+/.test(text)
  const hasPlaceLikeEntity =
    /[\u4e00-\u9fff]{2,}(?:大学|医院|博物院|机场|火车站|高铁站|大厦|中心|委员会|资源部|信息中心|政府|学校|学院|馆|园区|大楼|部|局)/.test(text)
  const hasDriveIntent = /驾车|drive|路线规划|路径规划|routelatlon/.test(text)
  const hasTransitIntent = /公交|地铁|换乘|transit/.test(text)
  const looksLikeNamedRoutePlanning =
    !hasExplicitCoordinates &&
    (hasNamedRouteConnector || hasPlaceLikeEntity) &&
    (hasDriveIntent || hasTransitIntent)

  if (/uuid|返程|busline|stationuuid|lineuuid|站点明细|公交线明细/.test(text)) {
    pushIfAvailable('scene10-bus-detail')
    pushIfAvailable('search-transit')
    return
  }

  if (/逆地理|坐标转地址|reverse\s*-?\s*geocode/.test(text)) {
    pushIfAvailable('scene6-reverse-geocoding')
    pushIfAvailable('geocoder')
    return
  }

  if (/地理编码|地址转坐标|geocode/.test(text)) {
    pushIfAvailable('scene5-geocoding')
    pushIfAvailable('geocoder')
    return
  }

  if (looksLikeNamedRoutePlanning) {
    pushIfAvailable('scene5-geocoding')
    pushIfAvailable('geocoder')
    if (hasTransitIntent) {
      pushIfAvailable('scene9-transit-planning')
      pushIfAvailable('search-transit')
    } else {
      pushIfAvailable('scene8-drive-route')
      pushIfAvailable('search-route')
    }
    return
  }

  if (hasTransitIntent) {
    pushIfAvailable('scene9-transit-planning')
    pushIfAvailable('search-transit')
    return
  }

  if (hasDriveIntent) {
    pushIfAvailable('scene8-drive-route')
    pushIfAvailable('search-route')
    return
  }

  if (/行政区|边界|district|administrative|childlevel|boundarygeojson/.test(text)) {
    pushIfAvailable('scene7-administrative-lookup')
    pushIfAvailable('search-admin')
    return
  }

  if (/分类|统计|category|stats|datatypes/.test(text)) {
    pushIfAvailable('scene4-category-stats-search')
    pushIfAvailable('search-v2')
    return
  }

  if (/视野|多边形|polygon|mapbound|范围/.test(text)) {
    pushIfAvailable('scene3-area-search')
    pushIfAvailable('search-v2')
    return
  }

  if (/周边|附近|nearby|pointlonlat|queryradius/.test(text)) {
    pushIfAvailable('scene2-nearby-search')
    pushIfAvailable('search-poi')
    return
  }

  pushIfAvailable('scene1-keyword-search')
  pushIfAvailable('search-v2')
}
