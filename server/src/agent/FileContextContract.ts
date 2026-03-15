import { parseJsonObject } from './PlannerJson.js'

export interface RuntimeGeojsonContract {
  version: 'geojson-runtime-contract-v2'
  kind: 'geojson'
  fileUrl: string
  responseShape: 'FeatureCollection'
  geojsonPath: string
  forbiddenPaths: string[]
  featureCount: number
  geometryTypeStats: Record<string, number>
  pointAccessorByGeometryType: Record<string, string>
  safeGuards: string[]
}

export interface RuntimeJsonContract {
  version: 'json-runtime-contract-v1'
  kind: 'json'
  fileUrl: string
  responseShape: 'object' | 'array'
  rootKeys?: string[]
  arrayLength?: number
  canonicalAccess: string[]
  forbiddenPatterns: string[]
  encodingNormalized: true
  safeGuards: string[]
}

export type RuntimeFileContract = RuntimeGeojsonContract | RuntimeJsonContract

export function buildRuntimeGeojsonContract(params: {
  fileUrl: string
  geojsonPath: string
  featureCollection: any
  forbiddenPaths?: string[]
}): RuntimeGeojsonContract {
  const features = Array.isArray(params.featureCollection?.features)
    ? params.featureCollection.features
    : []

  return {
    version: 'geojson-runtime-contract-v2',
    kind: 'geojson',
    fileUrl: params.fileUrl,
    responseShape: 'FeatureCollection',
    geojsonPath: params.geojsonPath,
    forbiddenPaths: dedupe(params.forbiddenPaths || defaultForbiddenPaths(params.geojsonPath)),
    featureCount: features.length,
    geometryTypeStats: getGeometryTypeStats(features),
    pointAccessorByGeometryType: {
      Point: 'geometry.coordinates',
      MultiPoint: 'geometry.coordinates[0]',
      LineString: 'geometry.coordinates[0]',
      MultiLineString: 'geometry.coordinates[0][0]',
      Polygon: 'geometry.coordinates[0][0]',
      MultiPolygon: 'geometry.coordinates[0][0][0]',
    },
    safeGuards: [
      '访问数组索引前必须判空：Array.isArray(x) && x.length > 0',
      '运行时禁止使用预览字段 coordinatesPreview',
      '对 e.features 访问前必须判空：if (!e.features || !e.features.length) return',
      '传入 map.addSource 的 data 必须是 FeatureCollection/Feature 对象，禁止传 features 数组',
    ],
  }
}

export function formatRuntimeGeojsonContract(contract: RuntimeGeojsonContract): string {
  return [
    '## 运行时文件契约（唯一可信，代码必须只按本节读取）',
    '```json',
    JSON.stringify(contract, null, 2),
    '```',
  ].join('\n')
}

export function buildRuntimeJsonContract(params: {
  fileUrl: string
  jsonData: any
}): RuntimeJsonContract {
  const responseShape = Array.isArray(params.jsonData) ? 'array' : 'object'
  const rootKeys = responseShape === 'object' && params.jsonData && typeof params.jsonData === 'object'
    ? Object.keys(params.jsonData)
    : undefined
  const arrayLength = responseShape === 'array' ? params.jsonData.length : undefined
  const canonicalAccess = buildCanonicalAccess(params.jsonData, responseShape)

  return {
    version: 'json-runtime-contract-v1',
    kind: 'json',
    fileUrl: params.fileUrl,
    responseShape,
    ...(rootKeys ? { rootKeys } : {}),
    ...(arrayLength != null ? { arrayLength } : {}),
    canonicalAccess,
    forbiddenPatterns: responseShape === 'object'
      ? ['rawData[0]', 'data[0]']
      : ['rawData.someKey', 'data.someKey'],
    encodingNormalized: true,
    safeGuards: responseShape === 'object'
      ? [
        '根结构是对象；不要使用 rawData[0] 或 data[0]。',
        '访问顶层数组前必须先确认 key 存在并且值是数组。',
        '顶层 key、字段名只允许来自运行时契约或自动数据理解结果。',
      ]
      : [
        '根结构是数组；不要直接假设 rawData.someKey。',
        '访问数组元素前必须判空：Array.isArray(rawData) && rawData.length > 0。',
        '数组元素字段名只允许来自运行时契约或自动数据理解结果。',
      ],
  }
}

export function formatRuntimeJsonContract(contract: RuntimeJsonContract): string {
  return [
    '## 运行时文件契约（唯一可信，代码必须只按本节读取）',
    '```json',
    JSON.stringify(contract, null, 2),
    '```',
  ].join('\n')
}

export function extractRuntimeFileContract(fileData?: string): RuntimeFileContract | null {
  if (!fileData || typeof fileData !== 'string') return null

  const block = findRuntimeContractBlock(fileData)
  if (!block) return null

  const parsed = parseJsonObject(block, {})
  if (parsed.kind === 'geojson') {
    return extractRuntimeGeojsonContract(fileData)
  }
  if (parsed.version !== 'json-runtime-contract-v1' || parsed.kind !== 'json') return null
  if (typeof parsed.fileUrl !== 'string' || !parsed.fileUrl.trim()) return null
  if (parsed.responseShape !== 'object' && parsed.responseShape !== 'array') return null

  return {
    version: 'json-runtime-contract-v1',
    kind: 'json',
    fileUrl: parsed.fileUrl,
    responseShape: parsed.responseShape,
    rootKeys: Array.isArray(parsed.rootKeys) ? parsed.rootKeys.map(String).map((item) => item.trim()).filter(Boolean) : undefined,
    ...(parsed.arrayLength != null ? { arrayLength: toSafeInteger(parsed.arrayLength) } : {}),
    canonicalAccess: Array.isArray(parsed.canonicalAccess)
      ? dedupe(parsed.canonicalAccess.map(String).map((item) => item.trim()).filter(Boolean))
      : [],
    forbiddenPatterns: Array.isArray(parsed.forbiddenPatterns)
      ? dedupe(parsed.forbiddenPatterns.map(String).map((item) => item.trim()).filter(Boolean))
      : [],
    encodingNormalized: true,
    safeGuards: Array.isArray(parsed.safeGuards)
      ? parsed.safeGuards.map(String).map((item) => item.trim()).filter(Boolean)
      : [],
  }
}

export function extractRuntimeGeojsonContract(fileData?: string): RuntimeGeojsonContract | null {
  if (!fileData || typeof fileData !== 'string') return null

  const block = findRuntimeContractBlock(fileData)
  if (!block) return null

  const parsed = parseJsonObject(block, {})
  if (parsed.version !== 'geojson-runtime-contract-v2' || parsed.kind !== 'geojson') return null
  if (parsed.responseShape !== 'FeatureCollection') return null
  if (typeof parsed.fileUrl !== 'string' || !parsed.fileUrl.trim()) return null
  if (typeof parsed.geojsonPath !== 'string' || !parsed.geojsonPath.trim()) return null

  return {
    version: 'geojson-runtime-contract-v2',
    kind: 'geojson',
    fileUrl: parsed.fileUrl,
    responseShape: 'FeatureCollection',
    geojsonPath: parsed.geojsonPath,
    forbiddenPaths: normalizeForbiddenPaths(
      Array.isArray(parsed.forbiddenPaths)
        ? parsed.forbiddenPaths.map(String).map((item) => item.trim()).filter(Boolean)
        : defaultForbiddenPaths(parsed.geojsonPath),
    ),
    featureCount: toSafeInteger(parsed.featureCount),
    geometryTypeStats: normalizeStats(parsed.geometryTypeStats),
    pointAccessorByGeometryType: normalizeStringMap(parsed.pointAccessorByGeometryType),
    safeGuards: Array.isArray(parsed.safeGuards)
      ? parsed.safeGuards.map(String).map((item) => item.trim()).filter(Boolean)
      : [],
  }
}

function findRuntimeContractBlock(fileData: string): string | null {
  const fencedMatch = fileData.match(
    /##\s*运行时文件契约（唯一可信，代码必须只按本节读取）[\s\S]*?```(?:json)?\s*([\s\S]*?)```/i,
  )
  if (fencedMatch?.[1]?.trim()) return fencedMatch[1].trim()

  const inlineMatch = fileData.match(/运行时文件契约\(JSON，唯一可信\):\s*([\s\S]*?)(?:\n##|\n[A-Z\u4e00-\u9fa5].*:|$)/i)
  if (inlineMatch?.[1]?.trim()) return inlineMatch[1].trim()

  const versionMatch = fileData.match(/\{[\s\S]*?"version"\s*:\s*"(?:geojson-runtime-contract-v2|json-runtime-contract-v1)"[\s\S]*?\}/)
  if (versionMatch?.[0]?.trim()) return versionMatch[0].trim()

  return null
}

function defaultForbiddenPaths(geojsonPath: string): string[] {
  if (geojsonPath === 'rawData') {
    return ['rawData.data', 'rawData.rawData']
  }
  if (geojsonPath === 'rawData.data') {
    return ['rawData.rawData']
  }
  return []
}

function getGeometryTypeStats(features: any[]): Record<string, number> {
  const stats: Record<string, number> = {}
  for (const feature of features || []) {
    const t = feature?.geometry?.type || 'Unknown'
    stats[t] = (stats[t] || 0) + 1
  }
  return stats
}

function normalizeStats(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const normalized: Record<string, number> = {}
  for (const [key, count] of Object.entries(value as Record<string, unknown>)) {
    normalized[String(key)] = toSafeInteger(count)
  }
  return normalized
}

function normalizeStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const normalized: Record<string, string> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'string' && item.trim()) normalized[String(key)] = item.trim()
  }
  return normalized
}

function toSafeInteger(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.round(n))
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items))
}

function buildCanonicalAccess(jsonData: any, responseShape: 'object' | 'array'): string[] {
  const access: string[] = []

  if (responseShape === 'object' && jsonData && typeof jsonData === 'object' && !Array.isArray(jsonData)) {
    for (const key of Object.keys(jsonData).slice(0, 8)) {
      access.push(`rawData[${JSON.stringify(key)}]`)
    }
    const firstArrayEntry = Object.entries(jsonData).find(([, value]) => Array.isArray(value))
    if (firstArrayEntry) {
      const [key, value] = firstArrayEntry
      access.push(`Array.isArray(rawData[${JSON.stringify(key)}])`)
      if (Array.isArray(value) && value.length > 0) {
        const item = value[0]
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const coordinateField = detectCoordinateField(item)
          if (coordinateField) {
            access.push(`item[${JSON.stringify(coordinateField)}] -> [lng, lat]`)
          }
        }
      }
    }
    return dedupe(access)
  }

  access.push('Array.isArray(rawData)')
  access.push('rawData[0]')
  if (Array.isArray(jsonData) && jsonData.length > 0) {
    const first = jsonData[0]
    if (first && typeof first === 'object' && !Array.isArray(first)) {
      const coordinateField = detectCoordinateField(first)
      if (coordinateField) {
        access.push(`item[${JSON.stringify(coordinateField)}] -> [lng, lat]`)
      }
    }
  }
  return dedupe(access)
}

function detectCoordinateField(value: Record<string, unknown>): string | null {
  for (const [key, item] of Object.entries(value)) {
    if (
      Array.isArray(item) &&
      item.length >= 2 &&
      typeof item[0] === 'number' &&
      typeof item[1] === 'number'
    ) {
      return key
    }
  }
  return null
}

function normalizeForbiddenPaths(paths: string[]): string[] {
  return dedupe(
    paths
      .filter(Boolean)
      .filter((path) => !/\.features\b/.test(path)),
  )
}
