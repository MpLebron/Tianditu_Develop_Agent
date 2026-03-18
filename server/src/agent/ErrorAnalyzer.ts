import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { config } from '../config.js'
import { createLLM } from '../llm/createLLM.js'
import type { ErrorAnalysisResult } from './AgentRuntimeTypes.js'
import { extractTextContent, parseJsonObject } from './PlannerJson.js'
import type { SkillStore } from './SkillStore.js'
import { extractErrorEvidence } from './ErrorEvidenceExtractor.js'
import { extractRuntimeFileContract, type RuntimeFileContract } from './FileContextContract.js'

export class ErrorAnalyzer {
  constructor(private skillStore: SkillStore) {}

  async analyze(params: {
    error: string
    code: string
    fileData?: string
  }): Promise<{ analysis: ErrorAnalysisResult; evidenceText: string }> {
    const evidence = extractErrorEvidence(params.error, params.code)
    const evidenceText = formatEvidence(evidence)
    const runtimeFileContract = extractRuntimeFileContract(params.fileData)
    try {
      const llm = createLLM({
        temperature: 0,
        maxTokens: 800,
        modelName: config.llm.auxModel,
      })
      const response = await llm.invoke([
        new SystemMessage(`你是一个代码修复错误分析器。根据错误证据输出 JSON。

输出字段：
- category: syntax | runtime | network | data | api | sandbox | unknown
- likelyCause: string
- confidence: number
- suggestedPackages: string[]
- suggestedReferences: string[]
- suggestedContracts: string[]
- fixChecklist: string[]

规则：
- package 只能从 tianditu-jsapi、tianditu-lbs、tianditu-ui-design、error-solution、echarts-charts 中选择
- suggestedReferences 优先输出 canonical 或 legacy reference 名称
- 只输出 JSON`),
        new HumanMessage([
          '## 运行错误',
          params.error,
          '',
          '## 错误证据',
          evidenceText,
          runtimeFileContract
            ? `\n## 已解析运行时文件契约（高优先级）\n${JSON.stringify(runtimeFileContract, null, 2)}`
            : '',
          params.fileData ? `\n## 文件上下文\n${params.fileData}` : '',
        ].filter(Boolean).join('\n')),
      ])
      const raw = extractTextContent(response.content).trim()
      const parsed = parseJsonObject(raw, {
        category: 'unknown',
        likelyCause: '',
        confidence: 0.5,
        suggestedPackages: [],
        suggestedReferences: [],
        suggestedContracts: [],
        fixChecklist: [],
      })

      const suggestedReferences = Array.isArray(parsed.suggestedReferences)
        ? dedupe(
          parsed.suggestedReferences
            .map(String)
            .map((item) => item.trim())
            .map((item) => this.skillStore.resolveAlias(item))
            .filter((item): item is string => Boolean(item)),
        )
        : []
      const suggestedPackages = Array.isArray(parsed.suggestedPackages)
        ? dedupe(
          parsed.suggestedPackages
            .map(String)
            .map((item) => item.trim())
            .map((item) => this.skillStore.getPackageEntry(item)?.id)
            .filter((item): item is string => Boolean(item)),
        )
        : []

      const analysis: ErrorAnalysisResult = {
        category: normalizeCategory(parsed.category),
        likelyCause: typeof parsed.likelyCause === 'string' ? parsed.likelyCause.trim() : fallbackLikelyCause(evidence, runtimeFileContract),
        confidence: normalizeConfidence(parsed.confidence),
        suggestedPackages: suggestedPackages.length ? suggestedPackages : fallbackSuggestedPackages(evidence),
        suggestedReferences: suggestedReferences.length ? suggestedReferences : fallbackSuggestedReferences(this.skillStore, evidence),
        suggestedContracts: Array.isArray(parsed.suggestedContracts)
          ? dedupe(parsed.suggestedContracts.map(String).map((item) => item.trim()).filter(Boolean))
          : fallbackSuggestedContracts(evidence),
        fixChecklist: Array.isArray(parsed.fixChecklist)
          ? parsed.fixChecklist.map(String).map((item) => item.trim()).filter(Boolean)
          : fallbackChecklist(evidence, runtimeFileContract),
        raw,
        decisionSource: 'analyzer',
      }

      return { analysis, evidenceText }
    } catch (error) {
      const analysis: ErrorAnalysisResult = {
        category: fallbackCategory(evidence),
        likelyCause: fallbackLikelyCause(evidence, runtimeFileContract),
        confidence: 0.58,
        suggestedPackages: fallbackSuggestedPackages(evidence),
        suggestedReferences: fallbackSuggestedReferences(this.skillStore, evidence),
        suggestedContracts: fallbackSuggestedContracts(evidence),
        fixChecklist: fallbackChecklist(evidence, runtimeFileContract),
        raw: String(error),
        decisionSource: 'fallback',
        fallbackReason: 'llm_error',
      }
      return { analysis, evidenceText }
    }
  }
}

export function formatErrorAnalysisForPrompt(analysis: ErrorAnalysisResult): string {
  return [
    `- 错误类别: ${analysis.category}`,
    `- 根因判断: ${analysis.likelyCause}`,
    `- 置信度: ${Math.round(analysis.confidence * 100)}%`,
    analysis.suggestedPackages.length ? `- 建议 package: ${analysis.suggestedPackages.join(', ')}` : '',
    analysis.suggestedReferences.length ? `- 建议 reference: ${analysis.suggestedReferences.join(', ')}` : '',
    analysis.suggestedContracts.length ? `- 建议 contract: ${analysis.suggestedContracts.join(', ')}` : '',
    '- 修复清单:',
    ...analysis.fixChecklist.map((item) => `  - ${item}`),
  ].filter(Boolean).join('\n')
}

function formatEvidence(evidence: ReturnType<typeof extractErrorEvidence>): string {
  return [
    `matchedSignals: ${evidence.matchedSignals.join(', ') || 'none'}`,
    `codeSignals: ${evidence.codeSignals.join(', ') || 'none'}`,
    `urls: ${evidence.urls.join(', ') || 'none'}`,
  ].join('\n')
}

function fallbackCategory(evidence: ReturnType<typeof extractErrorEvidence>): ErrorAnalysisResult['category'] {
  if (evidence.matchedSignals.includes('missing-sdk')) return 'api'
  if (evidence.matchedSignals.includes('overlay-api')) return 'api'
  if (evidence.codeSignals.some((signal) => ['generic-map-add', 'marker-constructor-mixed', 'marker-seticon-mixed'].includes(signal))) return 'api'
  if (evidence.matchedSignals.includes('syntax')) return 'syntax'
  if (evidence.matchedSignals.includes('layer-style-mismatch') || evidence.codeSignals.includes('fill-width-invalid')) return 'runtime'
  if (evidence.matchedSignals.includes('missing-before-layer')) return 'runtime'
  if (evidence.matchedSignals.includes('runtime-nullish')) return 'runtime'
  if (evidence.matchedSignals.includes('network')) return 'network'
  if (evidence.matchedSignals.includes('geojson')) return 'data'
  if (evidence.matchedSignals.includes('sandbox')) return 'sandbox'
  if (evidence.matchedSignals.some((signal) => ['geocoder', 'search', 'drive', 'transit', 'administrative'].includes(signal))) return 'api'
  return 'unknown'
}

function fallbackLikelyCause(
  evidence: ReturnType<typeof extractErrorEvidence>,
  runtimeFileContract?: RuntimeFileContract | null,
): string {
  const hasOverlayApiMismatch =
    evidence.matchedSignals.includes('overlay-api')
    || evidence.codeSignals.some((signal) => ['generic-map-add', 'marker-constructor-mixed', 'marker-seticon-mixed', 'popup-setelement-mixed'].includes(signal))

  if (hasOverlayApiMismatch) {
    return '覆盖物写法混入了其他地图 SDK 的 API：TMapGL 的 Marker/Popup 应使用 setLngLat(...).addTo(map)，Popup 内容应通过 setHTML()/setText() 设置，不能用 map.add(marker)、marker.setIcon(...) 或 popup.setElement(...) 这类未验证写法。'
  }

  if (evidence.matchedSignals.includes('missing-before-layer') || evidence.codeSignals.includes('layer-beforeid-literal')) {
    return '代码在 map.addLayer(layer, beforeId) 中写死了不存在的锚点层（例如 waterway-label）；当前底图样式里没有这个图层，所以业务图层在渲染时直接失败。'
  }

  if (evidence.matchedSignals.includes('layer-style-mismatch') || evidence.codeSignals.includes('fill-width-invalid')) {
    return '图层类型和样式属性不匹配：当前代码把不受支持的样式属性写进了图层 paint/layout（这次最可能是 fill 图层误用了 fill-width），导致 TMapGL 在 addLayer 时进入内部属性解析异常。'
  }

  const category = fallbackCategory(evidence)
  if (category === 'api' && evidence.matchedSignals.includes('missing-sdk')) {
    return '页面未正确引入天地图 JS SDK，或 SDK 加载顺序晚于业务脚本。'
  }
  if (category === 'syntax') {
    return '脚本存在语法错误或重复声明，导致页面在执行前中断。'
  }
  if (category === 'runtime') {
    if (runtimeFileContract?.kind === 'json') {
      return runtimeFileContract.responseShape === 'object'
        ? '运行时代码把对象根 JSON 错当成数组或使用了不存在的顶层 key，导致 undefined 属性访问。'
        : '运行时代码把数组根 JSON 错当成对象根，或没有先取数组元素再访问字段。'
    }
    return '对象/字段未判空即访问，或运行时代码读取了错误的数据结构。'
  }
  if (category === 'network') {
    return '请求 URL、代理路径或返回结构与代码假设不一致。'
  }
  if (category === 'data') {
    if (runtimeFileContract?.kind === 'geojson') {
      return runtimeFileContract.forbiddenPaths.length > 0
        ? `运行时代码没有严格遵循文件契约读取 GeoJSON。当前契约要求按 ${runtimeFileContract.geojsonPath} 读取，且禁止使用 ${runtimeFileContract.forbiddenPaths.join(', ')} 等额外包装层。`
        : `运行时代码没有严格遵循文件契约读取 GeoJSON。当前契约要求按 ${runtimeFileContract.geojsonPath} 读取，并确保传给 addSource 的是完整 FeatureCollection/Feature 对象。`
    }
    if (runtimeFileContract?.kind === 'json') {
      return runtimeFileContract.responseShape === 'object'
        ? '运行时代码没有按 JSON 对象根契约访问数据，误用了数组根写法或错误字段名。'
        : '运行时代码没有按 JSON 数组根契约访问数据，误用了对象根写法或错误字段名。'
    }
    return '传入地图的数据不是合法 GeoJSON 对象，或提取路径错误。'
  }
  if (category === 'sandbox') {
    return 'iframe 沙箱限制阻断了某些浏览器 API。'
  }
  return '错误信息不足，需要结合上下文做最小修复。'
}

function fallbackSuggestedPackages(evidence: ReturnType<typeof extractErrorEvidence>): string[] {
  const packages = new Set<string>(['error-solution'])
  if (evidence.matchedSignals.some((signal) => ['geocoder', 'search', 'drive', 'transit', 'administrative'].includes(signal))) {
    packages.add('tianditu-lbs')
  }
  if (
    evidence.matchedSignals.includes('geojson')
    || evidence.codeSignals.includes('mapbox-constructor')
    || evidence.matchedSignals.includes('missing-sdk')
    || evidence.matchedSignals.includes('missing-before-layer')
    || evidence.matchedSignals.includes('layer-style-mismatch')
    || evidence.matchedSignals.includes('overlay-api')
    || evidence.codeSignals.some((signal) => ['generic-map-add', 'marker-constructor-mixed', 'marker-seticon-mixed', 'layer-beforeid-literal', 'fill-width-invalid'].includes(signal))
  ) {
    packages.add('tianditu-jsapi')
  }
  return Array.from(packages)
}

function fallbackSuggestedReferences(skillStore: SkillStore, evidence: ReturnType<typeof extractErrorEvidence>): string[] {
  const refs: string[] = []
  const push = (name: string) => {
    const resolved = skillStore.resolveAlias(name)
    if (resolved && !refs.includes(resolved)) refs.push(resolved)
  }

  push('error-taxonomy')
  push('fix-playbook')
  if (evidence.matchedSignals.includes('geojson')) push('bindGeoJSON')
  if (evidence.matchedSignals.includes('administrative')) push('search-admin')
  if (evidence.matchedSignals.includes('geocoder')) push('geocoder')
  if (evidence.matchedSignals.includes('search')) push('search-v2')
  if (evidence.matchedSignals.includes('drive')) push('search-route')
  if (evidence.matchedSignals.includes('transit')) push('search-transit')
  if (evidence.matchedSignals.includes('missing-sdk') || evidence.codeSignals.includes('mapbox-constructor')) push('map-init')
  if (evidence.matchedSignals.includes('missing-before-layer') || evidence.codeSignals.includes('layer-beforeid-literal')) push('map-init')
  if (evidence.matchedSignals.includes('layer-style-mismatch') || evidence.codeSignals.includes('fill-width-invalid')) {
    push('bindPolygonLayer')
    push('bindLineLayer')
    push('bindGeoJSON')
  }
  if (evidence.matchedSignals.includes('overlay-api') || evidence.codeSignals.some((signal) => ['generic-map-add', 'marker-constructor-mixed', 'marker-seticon-mixed'].includes(signal))) {
    push('marker')
    push('popup')
  }
  return refs
}

function fallbackSuggestedContracts(evidence: ReturnType<typeof extractErrorEvidence>): string[] {
  const contracts: string[] = []
  if (evidence.matchedSignals.includes('administrative')) contracts.push('administrative')
  if (evidence.matchedSignals.includes('geocoder')) contracts.push('geocode')
  if (evidence.matchedSignals.includes('search')) contracts.push('search-v2-poi')
  if (evidence.matchedSignals.includes('drive')) contracts.push('drive')
  if (evidence.matchedSignals.includes('transit')) contracts.push('transit')
  return contracts
}

function fallbackChecklist(
  evidence: ReturnType<typeof extractErrorEvidence>,
  runtimeFileContract?: RuntimeFileContract | null,
): string[] {
  const checklist = ['优先做最小修复，不要整体重写页面。']
  if (evidence.matchedSignals.includes('missing-sdk')) checklist.push('补齐天地图 SDK 并确保位于业务脚本之前。')
  if (evidence.codeSignals.includes('mapbox-constructor')) checklist.push('将地图构造改成 new TMapGL.Map("map", { ... })。')
  if (evidence.matchedSignals.includes('overlay-api') || evidence.codeSignals.includes('generic-map-add')) {
    checklist.push('检查是否误用了 map.add(marker/popup)；TMapGL 覆盖物必须使用 marker.addTo(map) / popup.addTo(map)。')
  }
  if (evidence.codeSignals.includes('marker-constructor-mixed')) {
    checklist.push('检查 TMapGL.Marker 是否误用了 position/icon 等其他地图 SDK 的构造参数。')
    checklist.push('优先改成 new TMapGL.Marker({ element }).setLngLat([lng, lat]).addTo(map)。')
  }
  if (evidence.codeSignals.includes('marker-seticon-mixed')) {
    checklist.push('不要依赖 marker.setIcon(...)；需要改图标时移除旧 marker 并重新创建，或改用 GeoJSON 图层控制样式。')
  }
  if (evidence.matchedSignals.includes('missing-before-layer') || evidence.codeSignals.includes('layer-beforeid-literal')) {
    checklist.push('检查是否把 map.addLayer(layer, beforeId) 的第二个参数写死成了不存在的底图锚点层（如 waterway-label）。')
    checklist.push('只有在 map.getLayer(beforeId) 为真时才传 beforeId；否则直接调用 map.addLayer(layer)。')
  }
  if (evidence.matchedSignals.includes('layer-style-mismatch') || evidence.codeSignals.includes('fill-width-invalid')) {
    checklist.push('检查 addLayer 的图层类型与 paint/layout 属性是否匹配，不要把其他图层的样式键混进来。')
    checklist.push('如果是 fill 图层，禁止使用 fill-width；需要面边框宽度时，额外新增一个 line 图层，并在 line 图层上设置 line-width。')
    checklist.push('优先对照 bindPolygonLayer / bindLineLayer 示例修正图层样式，而不是先怀疑数据结构。')
  }
  if (evidence.matchedSignals.includes('geojson')) checklist.push('确认传给 addSource 的 data 是 FeatureCollection/Feature。')
  if (runtimeFileContract?.kind === 'geojson') {
    checklist.push(`严格按运行时文件契约读取 GeoJSON：${runtimeFileContract.geojsonPath}。`)
    if (runtimeFileContract.forbiddenPaths.length) {
      checklist.push(`禁止使用这些读取路径：${runtimeFileContract.forbiddenPaths.join(', ')}。`)
    }
    checklist.push('允许遍历 FeatureCollection.features 做热力图、列表和统计，但不要把 features 数组直接传给 map.addSource。')
  }
  if (runtimeFileContract?.kind === 'json') {
    checklist.push(`当前文件根结构是 ${runtimeFileContract.responseShape}，修复时必须优先遵循 canonicalAccess。`)
    if (runtimeFileContract.responseShape === 'object') {
      checklist.push('禁止使用 rawData[0] / data[0]，应直接按对象顶层 key 访问。')
    } else {
      checklist.push('禁止直接写 rawData.someKey；应先校验 Array.isArray(rawData) 再取数组元素。')
    }
    if (runtimeFileContract.canonicalAccess.length) {
      checklist.push(`优先使用这些访问方式：${runtimeFileContract.canonicalAccess.join('；')}。`)
    }
    if (runtimeFileContract.forbiddenPatterns.length) {
      checklist.push(`禁止这些访问模式：${runtimeFileContract.forbiddenPatterns.join(', ')}。`)
    }
  }
  if (evidence.matchedSignals.includes('network')) checklist.push('打印最终请求 URL，并核对代理 envelope 解析路径。')
  if (evidence.matchedSignals.includes('administrative')) checklist.push('优先使用 /api/tianditu/administrative 返回的 boundaryGeoJSON。')
  if (evidence.codeSignals.includes('invalid-default-style')) checklist.push('移除 style: "default"。')
  if (evidence.codeSignals.includes('invalid-styleid-field')) checklist.push('把 style: "black"/"blue" 改成 styleId: "black"/"blue"。')
  if (evidence.codeSignals.includes('invalid-styleid-default')) checklist.push('把 styleId: "default" 改成省略 styleId，或改成 styleId: "normal"。')
  if (evidence.codeSignals.includes('preview-field')) checklist.push('停止读取 coordinatesPreview，改用 geometry.coordinates。')
  return checklist
}

function normalizeCategory(value: unknown): ErrorAnalysisResult['category'] {
  const allowed: ErrorAnalysisResult['category'][] = ['syntax', 'runtime', 'network', 'data', 'api', 'sandbox', 'unknown']
  const normalized = String(value || '').trim().toLowerCase() as ErrorAnalysisResult['category']
  return allowed.includes(normalized) ? normalized : 'unknown'
}

function normalizeConfidence(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 0.6
  if (n > 1) return Math.max(0, Math.min(1, n / 100))
  return Math.max(0, Math.min(1, n))
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items))
}
