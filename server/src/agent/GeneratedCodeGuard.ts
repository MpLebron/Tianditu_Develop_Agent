export interface CodeGuardIssue {
  severity: 'error' | 'warning'
  code: string
  message: string
  suggestion: string
}

export function analyzeGeneratedCode(code: string): CodeGuardIssue[] {
  if (!code) return []
  const issues: CodeGuardIssue[] = []

  // 0) 使用 TMapGL 但缺失 SDK 脚本
  if (/\bTMapGL\b/.test(code) && !/api\.tianditu\.gov\.cn\/api\/v5\/js\?tk=/.test(code)) {
    issues.push({
      severity: 'error',
      code: 'missing-tianditu-sdk',
      message: '检测到使用 TMapGL，但未引入天地图 JS SDK 脚本，会触发 TMapGL is not defined。',
      suggestion: '补齐 <script src="https://api.tianditu.gov.cn/api/v5/js?tk=${TIANDITU_TOKEN}"></script> 并保证在业务脚本前执行。',
    })
  }

  // 1) TMapGL 构造签名错误（最常见）
  if (/new\s+TMapGL\.Map\s*\(\s*\{[\s\S]*?\bcontainer\s*:/.test(code)) {
    issues.push({
      severity: 'error',
      code: 'map-constructor-signature',
      message: '检测到 mapbox 风格构造：new TMapGL.Map({ container: ... })，会触发 Invalid type: container。',
      suggestion: '改为 new TMapGL.Map("map", { center, zoom, ... })。',
    })
  }

  // 2) 错误 geocoder 端点
  if (/api\.tianditu\.gov\.cn\/v5\/geocoder/i.test(code)) {
    issues.push({
      severity: 'error',
      code: 'wrong-geocoder-endpoint',
      message: '检测到 /v5/geocoder 端点，天地图地理编码不使用该路径。',
      suggestion: '改为 /geocoder，并使用 ds/postStr 参数格式。',
    })
  }

  // 3) 错误 geocode 参数（address=）
  if (/api\.tianditu\.gov\.cn\/geocoder\?[^"'`]*\baddress=/.test(code)) {
    issues.push({
      severity: 'error',
      code: 'wrong-geocoder-params',
      message: '检测到 geocoder 使用 address= 参数，属于错误调用格式。',
      suggestion: '正向编码请使用 ds=<JSON>；逆向编码使用 postStr=<JSON>&type=geocode。',
    })
  }

  // 4) style: default 会导致底图 404
  if (/\bstyle\s*:\s*['"]default['"]/.test(code)) {
    issues.push({
      severity: 'error',
      code: 'invalid-default-style',
      message: '检测到 style: "default"，该写法在当前运行环境会触发底图 404。',
      suggestion: '删除 style 字段；或仅使用已验证样式值。',
    })
  }

  // 5) 行政区划直连官方 + 手写 WKT 解析（高风险）
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

  // 6) 代理相对路径在 blob iframe 下可能解析失败
  if (/fetch\s*\(\s*['"]\/api\/tianditu\//.test(code) && !/new URL\(\s*['"]\/api\/tianditu\//.test(code)) {
    issues.push({
      severity: 'warning',
      code: 'relative-proxy-url',
      message: '检测到 fetch("/api/tianditu/...") 直接相对路径调用，运行沙箱中可能触发 URL 解析失败。',
      suggestion: '使用 new URL("/api/tianditu/...", window.location.origin).toString() 构建绝对 URL。',
    })
  }

  // 7) mapbox API 混入（常见于 loadImage/addImage）
  if (/\bmap\.(loadImage|addImage)\s*\(/.test(code)) {
    issues.push({
      severity: 'warning',
      code: 'mapbox-api-mixed',
      message: '检测到 map.loadImage/addImage，可能是 mapbox 风格 API 混入。',
      suggestion: '确认是否为 TMapGL 支持能力；不支持时改用 Marker/circle 图层实现。',
    })
  }

  // 8) 文本标注层会触发字体 pbf 请求告警（非致命）
  if (/['"]symbol['"][\s\S]{0,300}text-field/.test(code)) {
    issues.push({
      severity: 'warning',
      code: 'symbol-text-font',
      message: '检测到常驻 symbol text-field 文本层，可能产生字体 pbf 404 告警。',
      suggestion: '若非强需求，改用侧边栏/弹窗展示文字信息。',
    })
  }

  // 9) 误把预览字段用于运行时代码（高风险）
  if (/\bcoordinatesPreview\b/.test(code)) {
    issues.push({
      severity: 'error',
      code: 'preview-field-misuse',
      message: '检测到运行时代码使用 coordinatesPreview（仅用于文件预览，不保证存在）。',
      suggestion: '改用 geometry.coordinates，并在访问 [0] 前做 Array 判空保护。',
    })
  }

  return issues
}

export function hasBlockingGuardIssue(issues: CodeGuardIssue[]): boolean {
  return issues.some((x) => x.severity === 'error')
}

export function formatGuardIssuesForPrompt(issues: CodeGuardIssue[]): string {
  if (!issues.length) return '未发现明显静态风险。'
  return issues
    .map((x, idx) => {
      return [
        `${idx + 1}. [${x.severity.toUpperCase()}] ${x.code}`,
        `   - 问题: ${x.message}`,
        `   - 建议: ${x.suggestion}`,
      ].join('\n')
    })
    .join('\n')
}
