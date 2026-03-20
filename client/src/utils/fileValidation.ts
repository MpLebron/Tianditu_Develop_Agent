type JsonValidationResult =
  | { valid: true; previewText: string }
  | { valid: false; error: string }

type SupportedJsonExtension = '.json' | '.geojson'
type SupportedEncoding = 'utf-8' | 'gb18030'

export async function validateJsonLikeFile(file: File): Promise<JsonValidationResult> {
  const ext = getJsonLikeExtension(file.name)
  if (!ext) {
    return { valid: false, error: '仅支持校验 JSON / GeoJSON 文件。' }
  }

  try {
    const { text, value } = await readJsonWithFallback(file)
    validateJsonLikeContent(value, ext)
    return {
      valid: true,
      previewText: text,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      valid: false,
      error: message,
    }
  }
}

function getJsonLikeExtension(fileName: string): SupportedJsonExtension | null {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.geojson')) return '.geojson'
  if (lower.endsWith('.json')) return '.json'
  return null
}

async function readJsonWithFallback(file: File): Promise<{ text: string; value: unknown }> {
  const buffer = await file.arrayBuffer()
  const attempts: SupportedEncoding[] = ['utf-8', 'gb18030']
  let lastError: unknown = null

  for (const encoding of attempts) {
    try {
      const text = decodeText(buffer, encoding)
      return {
        text,
        value: JSON.parse(text),
      }
    } catch (error) {
      lastError = error
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError || '未知错误')
  throw new Error(`JSON 文件解析失败（已尝试 UTF-8 与 GB18030/GBK）：${detail}`)
}

function decodeText(buffer: ArrayBuffer, encoding: SupportedEncoding): string {
  const decoder = new TextDecoder(encoding, { fatal: true })
  return decoder.decode(buffer).replace(/^\uFEFF/, '')
}

function validateJsonLikeContent(data: unknown, ext: SupportedJsonExtension) {
  if (data == null || typeof data !== 'object') {
    throw new Error(`${ext.toUpperCase()} 文件内容不合法：根节点必须是对象或数组。`)
  }

  const geojson = asGeoJSON(data) || asGeoJSON((data as Record<string, unknown>).data)
  if (geojson) {
    const features = geojson.type === 'FeatureCollection' ? geojson.features : [geojson]
    if (!Array.isArray(features) || features.length === 0) {
      throw new Error(`${ext.toUpperCase()} 文件内容不合法：GeoJSON 必须至少包含 1 个要素。`)
    }
    return
  }

  if (ext === '.geojson') {
    throw new Error('GeoJSON 文件内容不合法：根节点或 data 字段必须是 FeatureCollection 或 Feature。')
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      throw new Error('JSON 文件内容不合法：数组根不能为空，至少需要 1 条对象记录。')
    }
    if (!data.some((item) => isPlainObject(item))) {
      throw new Error('JSON 文件内容不合法：数组根必须至少包含 1 条对象记录，或改为有效 GeoJSON。')
    }
    return
  }

  const record = data as Record<string, unknown>
  if (
    hasCoordinateFields(record)
    || hasCoordinateArrayPair(record)
    || hasTopLevelObjectArray(record)
  ) {
    return
  }

  throw new Error(
    'JSON 文件内容不合法：当前系统支持有效 GeoJSON、对象数组，或包含对象数组 / 经纬度字段的 JSON 对象。',
  )
}

function asGeoJSON(value: unknown): { type: string; features?: unknown[] } | null {
  if (!isPlainObject(value)) return null
  if (value.type === 'FeatureCollection' || value.type === 'Feature') {
    return value as { type: string; features?: unknown[] }
  }
  return null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function hasTopLevelObjectArray(value: Record<string, unknown>): boolean {
  return Object.values(value).some((item) => Array.isArray(item) && item.some((entry) => isPlainObject(entry)))
}

function hasCoordinateFields(value: Record<string, unknown>): boolean {
  const lngField = findKey(value, ['longitude', 'lng', 'lon', 'x', '经度'])
  const latField = findKey(value, ['latitude', 'lat', 'y', '纬度'])
  if (!lngField || !latField) return false
  return isFiniteCoordinate(value[lngField]) && isFiniteCoordinate(value[latField])
}

function hasCoordinateArrayPair(value: Record<string, unknown>): boolean {
  const coordField = findKey(value, ['coordinates', 'coordinate', 'coord', '坐标'])
  if (!coordField) return false
  const coords = value[coordField]
  return Array.isArray(coords)
    && coords.length >= 2
    && isFiniteCoordinate(coords[0])
    && isFiniteCoordinate(coords[1])
}

function findKey(value: Record<string, unknown>, candidates: string[]): string | null {
  const keys = Object.keys(value)
  const lowerKeys = keys.map((key) => key.toLowerCase())
  for (const candidate of candidates) {
    const index = lowerKeys.indexOf(candidate.toLowerCase())
    if (index !== -1) return keys[index]
  }
  return null
}

function isFiniteCoordinate(value: unknown): boolean {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num)
}
