export interface ApiContractSelectionInput {
  userInput: string
  conversationHistory?: string
  loadedSkills?: string[]
  runtimeError?: string
  mode: 'generate' | 'fix'
}

interface ApiContractRule {
  id: string
  title: string
  triggers: RegExp[]
  required: string[]
  responseChecks: string[]
  forbidden: string[]
}

const CONTRACTS: ApiContractRule[] = [
  {
    id: 'geocode',
    title: '地理编码（地址 -> 坐标）',
    triggers: [
      /地理编码|地址转坐标|geocode|开弦弓村|坐标是什么|查坐标/i,
    ],
    required: [
      '优先调用代理：GET /api/tianditu/geocode?address=<地址>',
      '若直接调用官方接口，只能用 /geocoder?ds=JSON，不可使用 address= 参数',
      '请求前对地址做非空校验；地址为空时直接提示，不发请求',
    ],
    responseChecks: [
      '代理返回成功条件：res.success === true',
      '地理编码成功条件：String(res.data.status) === "0" 且 res.data.location 存在',
      '坐标容错：Number(lon)/Number(lat) 后再使用 toFixed/地图定位',
    ],
    forbidden: [
      '禁止使用 /v5/geocoder',
      '禁止使用 https://api.tianditu.gov.cn/geocoder?address=...',
      '禁止假设正向编码会返回 addressComponent',
    ],
  },
  {
    id: 'reverse-geocode',
    title: '逆地理编码（坐标 -> 地址）',
    triggers: [
      /逆地理|坐标转地址|reverse geocode|反向地理编码/i,
    ],
    required: [
      '优先调用代理：GET /api/tianditu/reverse-geocode?lng=<经度>&lat=<纬度>',
      '坐标参数必须是有限数字；非法坐标直接拦截',
      '优先读取 res.data.result.formatted_address 与 result.addressComponent',
    ],
    responseChecks: [
      '代理返回成功条件：res.success === true',
      '逆地理成功条件：String(res.data.status) === "0" 且 res.data.result 存在',
    ],
    forbidden: [
      '禁止把逆地理接口当正向编码接口使用',
    ],
  },
  {
    id: 'drive',
    title: '驾车路线规划',
    triggers: [
      /驾车|开车|路线规划|北京到上海|drive/i,
    ],
    required: [
      '优先调用代理：GET /api/tianditu/drive?origLng=&origLat=&destLng=&destLat=&style=0',
      'style 取值仅 0/1/2/3（默认 0）',
      '路线坐标优先从 routelatlon 字符串解析，不要用“模拟路线”冒充真实结果',
    ],
    responseChecks: [
      '代理返回成功条件：res.success === true',
      '解析前先判空：res.data.routelatlon',
      '距离/时长字段判空：distance、duration 可能缺失，UI 要可降级展示',
    ],
    forbidden: [
      '禁止写死“模拟路线坐标”作为最终实现',
    ],
  },
  {
    id: 'transit',
    title: '公交/地铁规划',
    triggers: [
      /公交|地铁|换乘|transit|busline|linetype/i,
    ],
    required: [
      '优先调用代理：GET /api/tianditu/transit?startLng=&startLat=&endLng=&endLat=&lineType=1',
      'lineType 取值 1/2/3/4（快捷/少换乘/少步行/不坐地铁）',
      '线路坐标优先从 segments[].segmentLine[*].linePoint 解析',
      'segmentLine 可能是对象或数组，先归一化再读取',
      '时间/距离统计从 segmentLine[*].segmentTime / segmentDistance 读取',
    ],
    responseChecks: [
      '代理返回成功条件：res.success === true',
      '业务成功条件：Number(res.data.resultCode) === 0 且 results 数组非空',
      '方案统计不能依赖 line.distance / seg.segmentTime / seg.distance（这些字段常缺失）',
      'segmentType 比较前先 Number(seg.segmentType)，避免字符串/数字类型不一致',
      '空结果分支：显示 empty 状态，不得一直停留 loading',
    ],
    forbidden: [
      '禁止混用 startPosition / endPosition 与 startposition / endposition 大小写',
      '禁止把公交规划错写为 /drive 或 v2/search',
      '禁止出现“0分钟/0公里”但仍展示为可用方案（应先校验字段路径）',
    ],
  },
  {
    id: 'administrative',
    title: '行政区划边界',
    triggers: [
      /行政区|行政区划|边界|省界|市界|district|childlevel|administrative|江苏省/i,
    ],
    required: [
      '优先调用代理：GET /api/tianditu/administrative',
      '省级下钻地级市常用参数：childLevel=1&extensions=true&boundaryFormat=geojson&outputScope=children&expandChildrenBoundary=true',
      '前端渲染优先使用 boundaryGeoJSON，不要手写正则拆 WKT',
      '在运行沙箱中，代理 URL 使用 new URL("/api/tianditu/administrative", window.location.origin).toString()',
    ],
    responseChecks: [
      '代理返回成功条件：res.success === true',
      '业务成功条件：Number(res.data.status) === 200',
      '边界数据来源：res.data.data.district[*].boundaryGeoJSON',
    ],
    forbidden: [
      '禁止前端正则硬拆 MULTIPOLYGON 生成坐标',
      '禁止只看根节点导致“只显示 1 个省界”却宣称加载了地级市',
    ],
  },
  {
    id: 'search-v2-poi',
    title: '地名搜索/POI',
    triggers: [
      /poi|周边|附近|医院|景点|学校|v2\/search|querytype|pointlonlat|queryradius/i,
    ],
    required: [
      '优先调用代理：GET /api/tianditu/search?...',
      '按场景设置 queryType：视野内=2、周边=3、多边形=10、行政区=12、分类=13、统计=14',
      '医疗急救场景建议用 queryType=3 + pointLonlat + queryRadius',
    ],
    responseChecks: [
      '代理返回成功条件：res.success === true',
      'POI 成功条件：resultType===1 且 pois 为数组',
      '空结果分支：展示“无结果”状态并关闭 loading',
    ],
    forbidden: [
      '禁止 queryType 与参数组合不匹配（例如 queryType=3 但缺少 pointLonlat）',
    ],
  },
]

export function buildApiContractPrompt(input: ApiContractSelectionInput): string {
  const selected = selectContracts(input)
  if (selected.length === 0) return ''

  const blocks = selected.map((contract) => {
    const lines = [
      `[Contract:${contract.id}] ${contract.title}`,
      '- 必须遵守：',
      ...contract.required.map((x) => `  - ${x}`),
      '- 返回判定：',
      ...contract.responseChecks.map((x) => `  - ${x}`),
      '- 禁止项：',
      ...contract.forbidden.map((x) => `  - ${x}`),
    ]
    return lines.join('\n')
  })

  const asyncStateRules = [
    '[Contract:async-state] 异步状态机（强约束）',
    '- 所有异步数据加载必须维护 4 态：loading / ready / empty / error',
    '- fetch 成功但无数据时，状态必须进入 empty，不得继续显示“正在加载”',
    '- fetch 失败时，状态必须进入 error 并展示可操作提示（重试/检查参数）',
    '- loading 关闭必须放在 finally 或成功/失败分支的收敛点，防止悬挂',
  ].join('\n')

  return [asyncStateRules, ...blocks].join('\n\n')
}

function selectContracts(input: ApiContractSelectionInput): ApiContractRule[] {
  const text = [
    input.userInput || '',
    input.conversationHistory || '',
    input.runtimeError || '',
    ...(input.loadedSkills || []),
  ].join('\n')

  const matched = CONTRACTS.filter((c) => c.triggers.some((r) => r.test(text)))

  // 修复模式优先保留与运行错误最相关的契约，避免噪声过大
  if (input.mode === 'fix' && matched.length > 3) {
    return prioritizeContractsForFix(matched, input.runtimeError || '')
  }

  return matched.slice(0, 4)
}

function prioritizeContractsForFix(contracts: ApiContractRule[], runtimeError: string): ApiContractRule[] {
  const lower = runtimeError.toLowerCase()
  const scored = contracts.map((c) => {
    let score = 0
    if (c.id === 'administrative' && /administrative|district|childlevel|boundary|wkt/.test(lower)) score += 6
    if (c.id === 'geocode' && /geocoder|address|lon|lat/.test(lower)) score += 6
    if (c.id === 'transit' && /transit|busline|linetype/.test(lower)) score += 6
    if (c.id === 'drive' && /drive|route|routelatlon/.test(lower)) score += 6
    if (c.id === 'search-v2-poi' && /querytype|pointlonlat|queryradius|poi/.test(lower)) score += 6
    if (/failed to parse url|fetch|404|400|500/.test(lower)) score += 2
    return { c, score }
  })

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.c)
}
