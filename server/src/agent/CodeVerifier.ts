import type { VerificationIssue, VerificationResult } from './AgentRuntimeTypes.js'
import { extractRuntimeFileContract, type RuntimeJsonContract } from './FileContextContract.js'

export function analyzeGeneratedCode(code: string, options?: { fileData?: string }): VerificationIssue[] {
  if (!code) return []
  const issues: VerificationIssue[] = []
  const runtimeFileContract = extractRuntimeFileContract(options?.fileData)
  const hasSymbolTextField =
    /['"]symbol['"][\s\S]{0,500}['"]?text-field['"]?\s*:/.test(code) ||
    /['"]?text-field['"]?\s*:[\s\S]{0,500}['"]symbol['"]/.test(code)
  const hasExplicitTextFont = /['"]?text-font['"]?\s*:\s*\[/.test(code)
  const hasSupportedTextFont = /['"]?text-font['"]?\s*:\s*\[\s*['"]WenQuanYi Micro Hei Mono['"]\s*\]/.test(code)
  const hasKnownUnsupportedTextFont =
    /['"]?text-font['"]?\s*:\s*\[\s*['"](?:Microsoft YaHei|Open Sans Regular|Arial Unicode MS Regular)['"]/.test(code)

  if (/\bTMapGL\b/.test(code) && !/api\.tianditu\.gov\.cn\/api\/v5\/js\?tk=/.test(code)) {
    issues.push({
      severity: 'error',
      code: 'missing-tianditu-sdk',
      message: '检测到使用 TMapGL，但未引入天地图 JS SDK 脚本。',
      suggestion: '补齐 <script src="https://api.tianditu.gov.cn/api/v5/js?tk=${TIANDITU_TOKEN}"></script> 并保证在业务脚本前执行。',
    })
  }

  if (/new\s+TMapGL\.Map\s*\(\s*\{[\s\S]*?\bcontainer\s*:/.test(code)) {
    issues.push({
      severity: 'error',
      code: 'map-constructor-signature',
      message: '检测到 mapbox 风格构造：new TMapGL.Map({ container: ... })。',
      suggestion: '改为 new TMapGL.Map("map", { center, zoom, ... })。',
    })
  }

  const mapMutationTimingIssues = analyzeMapLoadTiming(code)
  issues.push(...mapMutationTimingIssues)
  issues.push(...analyzeLayerPropertyCompatibility(code))

  if (/api\.tianditu\.gov\.cn\/v5\/geocoder/i.test(code)) {
    issues.push({
      severity: 'error',
      code: 'wrong-geocoder-endpoint',
      message: '检测到 /v5/geocoder 端点，天地图地理编码不使用该路径。',
      suggestion: '改为 /geocoder，并使用 ds/postStr 参数格式，运行时代码优先走 /api/tianditu/geocode 或 /api/tianditu/reverse-geocode。',
    })
  }

  if (/api\.tianditu\.gov\.cn\/geocoder\?[^"'`]*\baddress=/.test(code)) {
    issues.push({
      severity: 'error',
      code: 'wrong-geocoder-params',
      message: '检测到 geocoder 使用 address= 参数，属于错误调用格式。',
      suggestion: '正向编码请使用代理 /api/tianditu/geocode；解释官方协议时使用 ds=<JSON>。',
    })
  }

  if (/\bstyle\s*:\s*['"]default['"]/.test(code)) {
    issues.push({
      severity: 'error',
      code: 'invalid-default-style',
      message: '检测到 style: "default"，当前运行环境可能触发底图 404。',
      suggestion: '删除 style 字段，或仅使用已验证样式值。',
    })
  }

  const usesAdministrative = /\/v2\/administrative|\/api\/tianditu\/administrative/.test(code)
  const manualWktParsing = /MULTIPOLYGON|POLYGON|\bboundary\b[\s\S]{0,120}\.replace\(/.test(code)
  if (usesAdministrative && manualWktParsing) {
    issues.push({
      severity: 'error',
      code: 'manual-wkt-parse',
      message: '检测到手写 WKT 解析逻辑，容易导致边界闭合错误或 NaN 坐标。',
      suggestion: '优先调用 /api/tianditu/administrative 并直接使用 boundaryGeoJSON 渲染。',
    })
  }

  if (/fetch\s*\(\s*['"]\/api\/tianditu\//.test(code) && !/new URL\(\s*['"]\/api\/tianditu\//.test(code)) {
    issues.push({
      severity: 'warning',
      code: 'relative-proxy-url',
      message: '检测到 fetch("/api/tianditu/...") 直接相对路径调用，运行沙箱中可能触发 URL 解析失败。',
      suggestion: '使用 new URL("/api/tianditu/...", window.location.origin).toString() 构建绝对 URL。',
    })
  }

  if (/api\.tianditu\.gov\.cn\/(?:v2\/search|search\/v1\/poi)/i.test(code)) {
    issues.push({
      severity: 'error',
      code: 'search-proxy-bypassed',
      message: '检测到直连天地图搜索官方端点，绕过了后端 /api/tianditu/search 代理契约。',
      suggestion: '统一改为 GET /api/tianditu/search（query string 传参）。',
    })
  }

  const namedRoutePlanningIssue = analyzeNamedRouteGeocodePreference(code)
  if (namedRoutePlanningIssue) {
    issues.push(namedRoutePlanningIssue)
  }

  if (
    /\/api\/tianditu\/search/.test(code) &&
    /\bmethod\s*:\s*['"]post['"]/i.test(code) &&
    /JSON\.stringify\(\s*(?:postStr|\{\s*postStr(?:\s*:\s*postStr)?\s*\})\s*\)/.test(code)
  ) {
    issues.push({
      severity: 'error',
      code: 'search-proxy-post-body',
      message: '检测到 /api/tianditu/search 使用 POST + body(postStr)，与当前后端 GET 参数契约不一致。',
      suggestion: '改为 GET + URLSearchParams。',
    })
  }

  const hasRelativeSearchProxyLiteral = /['"`]\/api\/tianditu\/search(?:\?|['"`])/.test(code)
  const hasAbsoluteSearchProxy = /new URL\(\s*['"`]\/api\/tianditu\/search/.test(code)
  if (hasRelativeSearchProxyLiteral && !hasAbsoluteSearchProxy) {
    issues.push({
      severity: 'error',
      code: 'search-proxy-relative-url',
      message: '检测到 /api/tianditu/search 使用相对路径，沙箱运行时可能 URL 解析失败。',
      suggestion: '改为 new URL("/api/tianditu/search", window.location.origin).toString() 构建绝对 URL。',
    })
  }

  const hasSearchProxyFetch = /\/api\/tianditu\/search/.test(code)
  const likelyReadsTopLevelAsBusiness =
    /(?:\.then\s*\(\s*function\s*\(\s*data\s*\)|\.then\s*\(\s*\(\s*data\s*\)\s*=>|(?:const|let|var)\s+data\s*=\s*await\s+\w+\.json\(\))[\s\S]{0,1200}\bdata\.(?:resultType|pois|status)\b/.test(code)
  const hasProxyEnvelopeUnwrap =
    /\bunwrapProxyPayload\s*\(|\bpayload\.data\b|\b(?:const|let|var)\s+data\s*=\s*payload\.data\b|\b(?:const|let|var)\s+result\s*=\s*payload\.data\b/.test(code)
  if (hasSearchProxyFetch && likelyReadsTopLevelAsBusiness && !hasProxyEnvelopeUnwrap) {
    issues.push({
      severity: 'error',
      code: 'search-proxy-envelope-mismatch',
      message: '检测到 /api/tianditu/search 可能把 res.json() 顶层对象当业务结果读取。',
      suggestion: '先校验 payload.success===true，再使用 payload.data；resultType/pois/status 必须从 payload.data 读取。',
    })
  }

  if (/\bmap\.(loadImage|addImage)\s*\(/.test(code)) {
    issues.push({
      severity: 'warning',
      code: 'mapbox-api-mixed',
      message: '检测到 map.loadImage/addImage，可能是 mapbox 风格 API 混入。',
      suggestion: '确认是否为 TMapGL 支持能力；不支持时改用 Marker/circle 图层实现。',
    })
  }

  if (hasSymbolTextField && !hasExplicitTextFont) {
    issues.push({
      severity: 'error',
      code: 'symbol-text-font-missing',
      message: '检测到 symbol text-field 文本层，但没有显式 text-font；默认字体栈可能触发 Open Sans/Arial Unicode glyph pbf 404。',
      suggestion: "若必须保留常驻文字，请显式设置 'text-font': ['WenQuanYi Micro Hei Mono']；否则改用侧边栏或弹窗展示文字。",
    })
  }

  if (hasSymbolTextField && hasExplicitTextFont && !hasSupportedTextFont) {
    issues.push({
      severity: 'error',
      code: 'symbol-text-font-unsupported',
      message: '检测到 symbol text-field 文本层使用了当前运行环境未验证的 text-font，可能触发字体 pbf 404。',
      suggestion: "将 text-font 统一改为 ['WenQuanYi Micro Hei Mono']，或移除常驻文字层。",
    })
  }

  if (hasSymbolTextField && hasSupportedTextFont) {
    issues.push({
      severity: 'warning',
      code: 'symbol-text-font',
      message: '检测到常驻 symbol text-field 文本层；虽然已设置受支持字体，仍建议只在明确需要时保留，以减少额外字形请求。',
      suggestion: '若只是辅助说明，优先用侧边栏或弹窗承载文字信息。',
    })
  } else if (hasSymbolTextField && hasKnownUnsupportedTextFont) {
    issues.push({
      severity: 'warning',
      code: 'symbol-text-font-known-bad',
      message: '检测到常见的 text-font 写法（如 Microsoft YaHei / Open Sans），这类字体栈在天地图 glyph 服务中常导致 404。',
      suggestion: "改为 ['WenQuanYi Micro Hei Mono']，不要把页面 CSS font-family 误当作图层 text-font。",
    })
  }

  if (/\bcoordinatesPreview\b/.test(code)) {
    issues.push({
      severity: 'error',
      code: 'preview-field-misuse',
      message: '检测到运行时代码使用 coordinatesPreview（仅用于文件预览，不保证存在）。',
      suggestion: '改用 geometry.coordinates，并在访问 [0] 前做 Array 判空保护。',
    })
  }

  const passesFeaturesArrayToGeojsonSource =
    /addSource\s*\([\s\S]{0,800}?type\s*:\s*['"]geojson['"][\s\S]{0,500}?data\s*:\s*(?:[A-Za-z_$][\w$]*\.)?features\b/.test(code) ||
    /addSource\s*\([\s\S]{0,800}?type\s*:\s*['"]geojson['"][\s\S]{0,500}?data\s*:\s*[A-Za-z_$][\w$]*\.features\b/.test(code)
  if (passesFeaturesArrayToGeojsonSource) {
    issues.push({
      severity: 'error',
      code: 'geojson-features-array-passed',
      message: '检测到把 features 数组直接传给 map.addSource({ type: "geojson", data })。',
      suggestion: '传入完整的 FeatureCollection/Feature 对象，不要传 geojson.features 或独立 features 数组。',
    })
  }

  if (runtimeFileContract?.kind === 'geojson') {
    const forbiddenMatches = runtimeFileContract.forbiddenPaths.filter((path) => {
      const pattern = new RegExp(`\\b${escapeRegExp(path).replace(/\\\./g, '\\s*\\.\\s*')}\\b`)
      return pattern.test(code)
    })

    if (forbiddenMatches.length > 0) {
      issues.push({
        severity: 'error',
        code: 'runtime-geojson-path-violated',
        message: `检测到代码使用了运行时文件契约禁止的路径：${forbiddenMatches.join(', ')}。`,
        suggestion: `当前文件契约要求按 ${runtimeFileContract.geojsonPath} 读取 GeoJSON，请严格遵循该路径并移除禁止路径。`,
      })
    }
  }

  if (runtimeFileContract?.kind === 'json') {
    issues.push(...analyzeRuntimeJsonContract(code, runtimeFileContract))
  }

  return issues
}

export function verifyCode(code: string, options?: { fileData?: string }): VerificationResult {
  const issues = analyzeGeneratedCode(code, options)
  return {
    issues,
    blocking: hasBlockingGuardIssue(issues),
    critique: formatGuardIssuesForPrompt(issues),
  }
}

export function hasBlockingGuardIssue(issues: VerificationIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'error')
}

export function formatGuardIssuesForPrompt(issues: VerificationIssue[]): string {
  if (!issues.length) return '未发现明显静态风险。'
  return issues
    .map((issue, index) => {
      return [
        `${index + 1}. [${issue.severity.toUpperCase()}] ${issue.code}`,
        `   - 问题: ${issue.message}`,
        `   - 建议: ${issue.suggestion}`,
      ].join('\n')
    })
    .join('\n')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function analyzeNamedRouteGeocodePreference(code: string): VerificationIssue | null {
  const hasDriveProxy = /\/api\/tianditu\/drive/.test(code)
  const hasTransitProxy = /\/api\/tianditu\/transit/.test(code)
  if (!hasDriveProxy && !hasTransitProxy) return null

  const hasGeocodeProxy = /\/api\/tianditu\/geocode|\/api\/tianditu\/reverse-geocode/.test(code)
  if (hasGeocodeProxy) return null

  const hasHardcodedStart =
    /\b(?:start|origin|orig|from)(?:Coords?|Point|LngLat|Location)?\s*=\s*\[\s*-?\d{2,3}(?:\.\d+)?\s*,\s*-?\d{1,2}(?:\.\d+)?\s*\]/i.test(code)
  const hasHardcodedEnd =
    /\b(?:end|dest|destination|to)(?:Coords?|Point|LngLat|Location)?\s*=\s*\[\s*-?\d{2,3}(?:\.\d+)?\s*,\s*-?\d{1,2}(?:\.\d+)?\s*\]/i.test(code)
  if (!hasHardcodedStart || !hasHardcodedEnd) return null

  const namedLocationLiterals = code.match(/['"`][^'"`\n]*[\u4e00-\u9fff]{2,}[^'"`\n]*['"`]/g) || []
  const hasPlaceLikeLabel = namedLocationLiterals.some((literal) =>
    /(大学|医院|博物院|机场|火车站|高铁站|大厦|中心|委员会|资源部|信息中心|政府|学校|学院|馆|园区|大楼|部|局|路|街|号)/.test(literal),
  )

  if (!hasPlaceLikeLabel) return null

  return {
    severity: 'warning',
    code: 'named-route-geocode-recommended',
    message: '检测到命名地点路线规划直接写死了起终点坐标；如果这些坐标不是用户明确提供，位置可能不准确。',
    suggestion: '优先先调用 /api/tianditu/geocode 把地点名、机构名或地址转成真实坐标，再调用 /api/tianditu/drive 或 /api/tianditu/transit。',
  }
}

function analyzeMapLoadTiming(code: string): VerificationIssue[] {
  const issues: VerificationIssue[] = []
  const hasTMap = /\bnew\s+TMapGL\.Map\s*\(/.test(code)
  if (!hasTMap) return issues

  const hasMapMutation = MAP_LOAD_GUARDED_APIS.some((pattern) => pattern.test(code))
  const hasLayerBoundEvent = /map\.on\s*\(\s*['"](?:click|mouseenter|mouseleave|mousemove|dblclick|contextmenu)['"]\s*,\s*['"`][^'"`]+['"`]\s*,/.test(code)
  const hasLoadHandler = /\bmap\.on\s*\(\s*['"]load['"]\s*,/.test(code)

  if ((hasMapMutation || hasLayerBoundEvent) && !hasLoadHandler) {
    issues.push({
      severity: 'error',
      code: 'map-load-guard-missing',
      message: '检测到地图图层/控件/视野操作，但代码中没有 map.on("load", ...) 保护。',
      suggestion: '先创建地图，再在 map.on("load", function () { ... }) 中执行 addSource / addLayer / addControl / fitBounds 和图层事件绑定。',
    })
    return issues
  }

  const mapInitIndex = code.search(/\bnew\s+TMapGL\.Map\s*\(/)
  const loadIndex = code.search(/\bmap\.on\s*\(\s*['"]load['"]\s*,/)
  const firstMutationIndex = firstRegexIndex(code, [
    ...MAP_LOAD_GUARDED_APIS,
    /\bmap\.on\s*\(\s*['"](?:click|mouseenter|mouseleave|mousemove|dblclick|contextmenu)['"]\s*,\s*['"`][^'"`]+['"`]\s*,/,
  ])
  const firstFetchIndex = code.search(/\bfetch\s*\(/)

  const suspiciousImmediateFlow =
    mapInitIndex >= 0 &&
    loadIndex > mapInitIndex &&
    (
      (firstMutationIndex >= 0 && firstMutationIndex < loadIndex) ||
      (firstFetchIndex >= 0 && firstFetchIndex > mapInitIndex && firstFetchIndex < loadIndex)
    )

  if (suspiciousImmediateFlow) {
    issues.push({
      severity: 'error',
      code: 'map-load-order-suspicious',
      message: '检测到在注册 map.on("load") 之前就开始 fetch 或执行图层/控件相关操作，存在地图状态未就绪的风险。',
      suggestion: '把 fetch 和渲染主流程也移动到 map.on("load", async function () { ... }) 内，或确保所有 map.addSource / map.addLayer / map.addControl / fitBounds 都只在 load 之后触发。',
    })
  }

  return issues
}

function analyzeLayerPropertyCompatibility(code: string): VerificationIssue[] {
  const issues: VerificationIssue[] = []
  const layerBlocks = extractAddLayerObjectBlocks(code)

  for (const block of layerBlocks) {
    const layerType = findTopLevelStringProperty(block, 'type') as keyof typeof LAYER_PROPERTY_RULES | null
    if (!layerType) continue
    if (!(layerType in LAYER_PROPERTY_RULES)) continue

    const layerId = findTopLevelStringProperty(block, 'id') || '未命名图层'
    const rule = LAYER_PROPERTY_RULES[layerType as keyof typeof LAYER_PROPERTY_RULES]

    const paintLiteral = findTopLevelObjectProperty(block, 'paint')
    if (paintLiteral) {
      const invalidPaintKeys = collectTopLevelObjectKeys(paintLiteral).filter((key) => !rule.paint.has(key))
      if (invalidPaintKeys.length > 0) {
        issues.push({
          severity: 'error',
          code: 'layer-paint-property-invalid',
          message: `检测到 ${layerType} 图层（${layerId}）使用了不受支持的 paint 属性：${invalidPaintKeys.join(', ')}。`,
          suggestion: buildLayerPropertySuggestion(layerType, 'paint', invalidPaintKeys),
        })
      }
    }

    const layoutLiteral = findTopLevelObjectProperty(block, 'layout')
    if (layoutLiteral) {
      const invalidLayoutKeys = collectTopLevelObjectKeys(layoutLiteral).filter((key) => !rule.layout.has(key))
      if (invalidLayoutKeys.length > 0) {
        issues.push({
          severity: 'error',
          code: 'layer-layout-property-invalid',
          message: `检测到 ${layerType} 图层（${layerId}）使用了不受支持的 layout 属性：${invalidLayoutKeys.join(', ')}。`,
          suggestion: buildLayerPropertySuggestion(layerType, 'layout', invalidLayoutKeys),
        })
      }
    }
  }

  return issues
}

function analyzeRuntimeJsonContract(code: string, contract: RuntimeJsonContract): VerificationIssue[] {
  const issues: VerificationIssue[] = []

  if (contract.responseShape === 'object') {
    if (/\brawData\s*\[\s*0\s*\]/.test(code) || /\b(?:const|let|var)\s+rawData\s*=\s*data\s*\[\s*0\s*\]/.test(code)) {
      issues.push({
        severity: 'error',
        code: 'runtime-json-root-object-violated',
        message: '运行时文件契约声明当前 JSON 根结构是对象，但代码使用了数组根写法（如 rawData[0] / const rawData = data[0]）。',
        suggestion: `应直接按对象顶层 key 访问。优先使用契约给出的 canonicalAccess：${contract.canonicalAccess.join('；') || '见运行时契约'}`,
      })
    }

    const unknownRootKeys = findUnknownObjectRootKeys(code, contract)
    if (unknownRootKeys.length > 0) {
      issues.push({
        severity: 'warning',
        code: 'runtime-json-unknown-root-key',
        message: `检测到代码访问了不在运行时契约 rootKeys/canonicalAccess 中的顶层 key：${unknownRootKeys.join(', ')}。`,
        suggestion: `请只使用真实顶层 key：${contract.rootKeys?.join('、') || '见运行时契约'}。不要凭空发明字段名或分组别名。`,
      })
    }
  } else {
    const invalidArrayRootAccesses = findInvalidArrayRootAccesses(code)
    if (invalidArrayRootAccesses.length > 0) {
      issues.push({
        severity: 'error',
        code: 'runtime-json-root-array-violated',
        message: `运行时文件契约声明当前 JSON 根结构是数组，但代码把 rawData 当对象根直接访问：${invalidArrayRootAccesses.join(', ')}。`,
        suggestion: '应先确认 Array.isArray(rawData) 并访问数组元素，再读取字段；不要直接写 rawData.someKey。',
      })
    }
  }

  return issues
}

function findUnknownObjectRootKeys(code: string, contract: RuntimeJsonContract): string[] {
  const allowedKeys = new Set(contract.rootKeys || [])
  if (!allowedKeys.size) return []

  const unknown = new Set<string>()
  for (const key of findBracketAccesses(code, 'rawData')) {
    if (!allowedKeys.has(key)) unknown.add(key)
  }
  for (const key of findDotAccesses(code, 'rawData')) {
    if (!allowedKeys.has(key) && !SAFE_OBJECT_ROOT_PROPERTIES.has(key)) {
      unknown.add(key)
    }
  }

  return Array.from(unknown)
}

function findInvalidArrayRootAccesses(code: string): string[] {
  const invalid = new Set<string>()
  for (const key of findDotAccesses(code, 'rawData')) {
    if (!SAFE_ARRAY_ROOT_PROPERTIES.has(key)) invalid.add(`rawData.${key}`)
  }
  return Array.from(invalid)
}

function findBracketAccesses(code: string, variableName: string): string[] {
  const matches: string[] = []
  const pattern = new RegExp(
    `\\b${escapeRegExp(variableName)}\\s*\\[\\s*(?:'([^'\\n]+)'|"([^"\\n]+)"|\`([^\`\\n]+)\`)\\s*\\]`,
    'g',
  )
  let match: RegExpExecArray | null
  while ((match = pattern.exec(code)) !== null) {
    const key = match[1] || match[2] || match[3]
    if (key) matches.push(key.trim())
  }
  return matches
}

function findDotAccesses(code: string, variableName: string): string[] {
  const matches: string[] = []
  const pattern = new RegExp(`\\b${escapeRegExp(variableName)}\\s*(?:\\?\\.|\\.)\\s*([A-Za-z_$][\\w$]*)`, 'g')
  let match: RegExpExecArray | null
  while ((match = pattern.exec(code)) !== null) {
    matches.push(match[1].trim())
  }
  return matches
}

const SAFE_OBJECT_ROOT_PROPERTIES = new Set<string>(['toString', 'valueOf'])

const SAFE_ARRAY_ROOT_PROPERTIES = new Set<string>([
  'length',
  'map',
  'forEach',
  'filter',
  'find',
  'reduce',
  'some',
  'every',
  'slice',
  'at',
])

const MAP_LOAD_GUARDED_APIS = [
  /\bmap\.addSource\s*\(/,
  /\bmap\.addLayer\s*\(/,
  /\bmap\.addControl\s*\(/,
  /\bmap\.fitBounds\s*\(/,
  /\bmap\.setPaintProperty\s*\(/,
  /\bmap\.setLayoutProperty\s*\(/,
]

function firstRegexIndex(code: string, patterns: RegExp[]): number {
  const indexes = patterns
    .map((pattern) => code.search(pattern))
    .filter((index) => index >= 0)

  return indexes.length ? Math.min(...indexes) : -1
}

const LAYER_PROPERTY_RULES = {
  fill: {
    paint: new Set<string>([
      'fill-antialias',
      'fill-opacity',
      'fill-color',
      'fill-outline-color',
      'fill-translate',
      'fill-translate-anchor',
      'fill-pattern',
    ]),
    layout: new Set<string>(['fill-sort-key', 'visibility']),
  },
  line: {
    paint: new Set<string>([
      'line-opacity',
      'line-color',
      'line-translate',
      'line-translate-anchor',
      'line-width',
      'line-gap-width',
      'line-offset',
      'line-blur',
      'line-dasharray',
      'line-pattern',
      'line-gradient',
    ]),
    layout: new Set<string>(['line-cap', 'line-join', 'line-sort-key', 'visibility']),
  },
  circle: {
    paint: new Set<string>([
      'circle-radius',
      'circle-color',
      'circle-blur',
      'circle-opacity',
      'circle-translate',
      'circle-translate-anchor',
      'circle-pitch-scale',
      'circle-pitch-alignment',
      'circle-stroke-width',
      'circle-stroke-color',
      'circle-stroke-opacity',
    ]),
    layout: new Set<string>(['circle-sort-key', 'visibility']),
  },
} as const

function buildLayerPropertySuggestion(
  layerType: keyof typeof LAYER_PROPERTY_RULES,
  propertyGroup: 'paint' | 'layout',
  invalidKeys: string[],
): string {
  if (layerType === 'fill' && invalidKeys.includes('fill-width')) {
    return 'fill 图层不支持 fill-width；如果需要可调的面边框宽度，请保留 fill 图层负责填充，并额外新增一个 line 图层设置 line-width。'
  }

  const expectedPrefix = `${layerType}-`
  return `${layerType} 图层的 ${propertyGroup} 属性通常应使用 ${expectedPrefix}* 前缀或该图层支持的通用属性。请对照 JSAPI 示例删除无效属性，必要时改用匹配的图层类型（例如面边框宽度用 line 图层）。`
}

function extractAddLayerObjectBlocks(code: string): string[] {
  const blocks: string[] = []
  const pattern = /\bmap\.addLayer\s*\(/g
  let match: RegExpExecArray | null

  while ((match = pattern.exec(code)) !== null) {
    const objectStart = code.indexOf('{', match.index)
    if (objectStart < 0) continue
    const block = extractBalancedBlock(code, objectStart, '{', '}')
    if (!block) continue
    blocks.push(block)
  }

  return blocks
}

function findTopLevelStringProperty(objectLiteral: string, key: string): string | null {
  const propertyStart = findTopLevelPropertyIndex(objectLiteral, key)
  if (propertyStart < 0) return null
  const valueStart = skipWhitespace(objectLiteral, propertyStart)
  const quote = objectLiteral[valueStart]
  if (quote !== '"' && quote !== "'") return null

  let value = ''
  let escaped = false
  for (let i = valueStart + 1; i < objectLiteral.length; i += 1) {
    const char = objectLiteral[i]
    if (escaped) {
      value += char
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === quote) return value
    value += char
  }

  return null
}

function findTopLevelObjectProperty(objectLiteral: string, key: string): string | null {
  const propertyStart = findTopLevelPropertyIndex(objectLiteral, key)
  if (propertyStart < 0) return null
  const valueStart = skipWhitespace(objectLiteral, propertyStart)
  if (objectLiteral[valueStart] !== '{') return null
  return extractBalancedBlock(objectLiteral, valueStart, '{', '}')
}

function findTopLevelPropertyIndex(objectLiteral: string, key: string): number {
  const keys = collectTopLevelObjectKeyEntries(objectLiteral)
  const match = keys.find((entry) => entry.key === key)
  return match ? match.valueStart : -1
}

function collectTopLevelObjectKeys(objectLiteral: string): string[] {
  return collectTopLevelObjectKeyEntries(objectLiteral).map((entry) => entry.key)
}

function collectTopLevelObjectKeyEntries(objectLiteral: string): Array<{ key: string; valueStart: number }> {
  const entries: Array<{ key: string; valueStart: number }> = []
  let braceDepth = 0
  let bracketDepth = 0
  let parenDepth = 0
  let inSingle = false
  let inDouble = false
  let inTemplate = false
  let inLineComment = false
  let inBlockComment = false
  let escaped = false

  for (let i = 0; i < objectLiteral.length; i += 1) {
    const char = objectLiteral[i]
    const next = objectLiteral[i + 1]

    if (inLineComment) {
      if (char === '\n') inLineComment = false
      continue
    }
    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false
        i += 1
      }
      continue
    }
    if (inSingle) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === "'") {
        inSingle = false
      }
      continue
    }
    if (inDouble) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inDouble = false
      }
      continue
    }
    if (inTemplate) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '`') {
        inTemplate = false
      }
      continue
    }

    if (char === '/' && next === '/') {
      inLineComment = true
      i += 1
      continue
    }
    if (char === '/' && next === '*') {
      inBlockComment = true
      i += 1
      continue
    }

    if (braceDepth === 1 && bracketDepth === 0 && parenDepth === 0 && !/\s|,/.test(char)) {
      let key = ''
      let cursor = i
      if (char === "'" || char === '"') {
        const quote = char
        cursor += 1
        while (cursor < objectLiteral.length) {
          const current = objectLiteral[cursor]
          if (current === '\\') {
            cursor += 2
            continue
          }
          if (current === quote) break
          key += current
          cursor += 1
        }
        cursor += 1
      } else if (/[A-Za-z_$]/.test(char)) {
        key += char
        cursor += 1
        while (cursor < objectLiteral.length && /[\w$-]/.test(objectLiteral[cursor])) {
          key += objectLiteral[cursor]
          cursor += 1
        }
      }

      if (key) {
        const colonIndex = skipWhitespace(objectLiteral, cursor)
        if (objectLiteral[colonIndex] === ':') {
          const valueStart = skipWhitespace(objectLiteral, colonIndex + 1)
          entries.push({ key, valueStart })
          i = colonIndex
          continue
        }
      }
    }

    if (char === "'") {
      inSingle = true
      continue
    }
    if (char === '"') {
      inDouble = true
      continue
    }
    if (char === '`') {
      inTemplate = true
      continue
    }

    if (char === '{') {
      braceDepth += 1
      continue
    }
    if (char === '}') {
      braceDepth -= 1
      continue
    }
    if (char === '[') {
      bracketDepth += 1
      continue
    }
    if (char === ']') {
      bracketDepth -= 1
      continue
    }
    if (char === '(') {
      parenDepth += 1
      continue
    }
    if (char === ')') {
      parenDepth -= 1
      continue
    }

  }

  return entries
}

function extractBalancedBlock(
  source: string,
  startIndex: number,
  openChar: '{' | '[' | '(',
  closeChar: '}' | ']' | ')',
): string | null {
  let depth = 0
  let inSingle = false
  let inDouble = false
  let inTemplate = false
  let inLineComment = false
  let inBlockComment = false
  let escaped = false

  for (let i = startIndex; i < source.length; i += 1) {
    const char = source[i]
    const next = source[i + 1]

    if (inLineComment) {
      if (char === '\n') inLineComment = false
      continue
    }
    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false
        i += 1
      }
      continue
    }
    if (inSingle) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === "'") {
        inSingle = false
      }
      continue
    }
    if (inDouble) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inDouble = false
      }
      continue
    }
    if (inTemplate) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '`') {
        inTemplate = false
      }
      continue
    }

    if (char === '/' && next === '/') {
      inLineComment = true
      i += 1
      continue
    }
    if (char === '/' && next === '*') {
      inBlockComment = true
      i += 1
      continue
    }
    if (char === "'") {
      inSingle = true
      continue
    }
    if (char === '"') {
      inDouble = true
      continue
    }
    if (char === '`') {
      inTemplate = true
      continue
    }

    if (char === openChar) depth += 1
    if (char === closeChar) depth -= 1
    if (depth === 0) return source.slice(startIndex, i + 1)
  }

  return null
}

function skipWhitespace(source: string, index: number): number {
  let cursor = index
  while (cursor < source.length && /\s/.test(source[cursor])) {
    cursor += 1
  }
  return cursor
}
