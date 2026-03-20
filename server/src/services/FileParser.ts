import { readFile } from 'fs/promises'
import { extname } from 'path'
import XLSX, { type WorkBook } from 'xlsx'

export interface ParsedData {
  type: 'csv' | 'excel' | 'geojson' | 'json'
  headers: string[]
  rows: Record<string, any>[]
  geojson?: any
  json?: any
  summary: string
  encoding?: 'utf-8' | 'gb18030'
  rootShape?: 'object' | 'array'
  topLevelKeys?: string[]
  arrayLength?: number
}

export class FileValidationError extends Error {
  statusCode = 400

  constructor(message: string) {
    super(message)
    this.name = 'FileValidationError'
  }
}

/**
 * 文件解析器：CSV / Excel / GeoJSON
 */
export class FileParser {
  async parse(filePath: string): Promise<ParsedData> {
    const ext = extname(filePath).toLowerCase()

    if (ext === '.geojson' || ext === '.json') {
      return this.parseJSON(filePath, ext)
    }
    if (ext === '.csv') {
      return this.parseCSV(filePath)
    }
    if (ext === '.xlsx' || ext === '.xls') {
      return this.parseExcel(filePath)
    }

    throw new Error(`不支持的文件格式: ${ext}`)
  }

  private async parseJSON(filePath: string, ext: '.json' | '.geojson'): Promise<ParsedData> {
    const content = await readFile(filePath)
    const parsed = parseJsonBufferWithFallback(content, filePath)
    const data = parsed.value
    this.validateJsonLikeContent(data, ext)
    const rootShape = Array.isArray(data) ? 'array' : 'object'
    const topLevelKeys = !Array.isArray(data) && data && typeof data === 'object' ? Object.keys(data) : undefined
    const arrayLength = Array.isArray(data) ? data.length : undefined

    const directGeoJSON = this.asGeoJSON(data)
    if (directGeoJSON) {
      const features = directGeoJSON.type === 'FeatureCollection' ? directGeoJSON.features : [directGeoJSON]
      const headers = features.length > 0 ? Object.keys(features[0].properties || {}) : []
      return {
        type: 'geojson',
        headers,
        rows: features.map((f: any) => f.properties || {}),
        geojson: directGeoJSON,
        json: data,
        encoding: parsed.encoding,
        rootShape,
        topLevelKeys,
        arrayLength,
        summary: [
          `GeoJSON 数据，${features.length} 个要素，字段: ${headers.slice(0, 5).join(', ')}`,
          'GeoJSON提取路径: rawData',
          '注意: map.addSource 的 data 必须是 FeatureCollection/Feature 对象，不能直接传 features 数组',
        ].join('\n'),
      }
    }

    // 常见包装格式：{ status, message, data: FeatureCollection }
    const wrappedGeoJSON = this.asGeoJSON(data?.data)
    if (wrappedGeoJSON) {
      const features = wrappedGeoJSON.type === 'FeatureCollection' ? wrappedGeoJSON.features : [wrappedGeoJSON]
      const headers = features.length > 0 ? Object.keys(features[0].properties || {}) : []
      return {
        type: 'geojson',
        headers,
        rows: features.map((f: any) => f.properties || {}),
        geojson: wrappedGeoJSON,
        json: data,
        encoding: parsed.encoding,
        rootShape,
        topLevelKeys,
        arrayLength,
        summary: [
          `GeoJSON 数据（包装对象 data 字段），${features.length} 个要素，字段: ${headers.slice(0, 5).join(', ')}`,
          '原始响应根结构: 对象（常见字段 status / message / data）',
          'GeoJSON提取路径: rawData.data',
          '注意: rawData.data 已经是 FeatureCollection；不要使用 rawData[0].data；不要把 rawData.data.features 数组直接传给 map.addSource',
        ].join('\n'),
      }
    }

    // 普通 JSON 数组
    if (Array.isArray(data)) {
      const headers = data.length > 0 ? Object.keys(data[0]) : []
      return {
        type: 'json',
        headers,
        rows: data,
        json: data,
        encoding: parsed.encoding,
        rootShape,
        arrayLength,
        summary: `JSON 数据，${data.length} 条记录，字段: ${headers.slice(0, 5).join(', ')}`,
      }
    }

    return {
      type: 'json',
      headers: Object.keys(data),
      rows: [data],
      json: data,
      encoding: parsed.encoding,
      rootShape,
      topLevelKeys,
      summary: `JSON 对象，字段: ${Object.keys(data).slice(0, 5).join(', ')}`,
    }
  }

  private asGeoJSON(value: any): any | null {
    if (!value || typeof value !== 'object') return null
    if (value.type === 'FeatureCollection' || value.type === 'Feature') return value
    return null
  }

  private validateJsonLikeContent(data: any, ext: '.json' | '.geojson') {
    if (data == null || typeof data !== 'object') {
      throw new FileValidationError(`${ext.toUpperCase()} 文件内容不合法：根节点必须是对象或数组。`)
    }

    const geojson = this.asGeoJSON(data) || this.asGeoJSON(data?.data)
    if (geojson) {
      const features = geojson.type === 'FeatureCollection' ? geojson.features : [geojson]
      if (!Array.isArray(features) || features.length === 0) {
        throw new FileValidationError(`${ext.toUpperCase()} 文件内容不合法：GeoJSON 必须至少包含 1 个要素。`)
      }
      return
    }

    if (ext === '.geojson') {
      throw new FileValidationError('GeoJSON 文件内容不合法：根节点或 data 字段必须是 FeatureCollection 或 Feature。')
    }

    if (Array.isArray(data)) {
      if (data.length === 0) {
        throw new FileValidationError('JSON 文件内容不合法：数组根不能为空，至少需要 1 条对象记录。')
      }
      if (!data.some((item) => isPlainObject(item))) {
        throw new FileValidationError('JSON 文件内容不合法：数组根必须至少包含 1 条对象记录，或改为有效 GeoJSON。')
      }
      return
    }

    if (
      hasCoordinateFields(data)
      || hasCoordinateArrayPair(data)
      || hasTopLevelObjectArray(data)
    ) {
      return
    }

    throw new FileValidationError(
      'JSON 文件内容不合法：当前系统支持有效 GeoJSON、对象数组，或包含对象数组 / 经纬度字段的 JSON 对象。',
    )
  }

  private async parseCSV(filePath: string): Promise<ParsedData> {
    const content = await readFile(filePath, 'utf-8')
    const workbook = XLSX.read(content, { type: 'string' })
    return this.workbookToData(workbook, 'csv')
  }

  private async parseExcel(filePath: string): Promise<ParsedData> {
    const buffer = await readFile(filePath)
    const workbook = XLSX.read(buffer)
    return this.workbookToData(workbook, 'excel')
  }

  private workbookToData(workbook: WorkBook, type: 'csv' | 'excel'): ParsedData {
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet)
    const headers = rows.length > 0 ? Object.keys(rows[0]) : []

    return {
      type,
      headers,
      rows,
      summary: `${type.toUpperCase()} 数据，${rows.length} 行，字段: ${headers.slice(0, 8).join(', ')}`,
    }
  }
}

export function parseJsonBufferWithFallback(
  buffer: Buffer,
  filePath: string,
): { value: any; encoding: 'utf-8' | 'gb18030' } {
  const attempts: Array<{ encoding: 'utf-8' | 'gb18030'; label: string }> = [
    { encoding: 'utf-8', label: 'UTF-8' },
    // gb18030 covers common GBK/GB2312 JSON exports from Chinese desktop tools.
    { encoding: 'gb18030', label: 'GB18030/GBK' },
  ]

  let lastError: unknown = null

  for (const attempt of attempts) {
    try {
      const text = decodeText(buffer, attempt.encoding)
      return { value: JSON.parse(text), encoding: attempt.encoding }
    } catch (error) {
      lastError = error
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError || '未知错误')
  throw new FileValidationError(`JSON 文件解析失败（已尝试 UTF-8 与 GB18030/GBK）: ${filePath}；${detail}`)
}

function decodeText(buffer: Buffer, encoding: 'utf-8' | 'gb18030'): string {
  const decoder = new TextDecoder(encoding, { fatal: true })
  return decoder.decode(buffer).replace(/^\uFEFF/, '')
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function hasTopLevelObjectArray(value: Record<string, any>): boolean {
  return Object.values(value).some((item) => Array.isArray(item) && item.some((entry) => isPlainObject(entry)))
}

function hasCoordinateFields(value: Record<string, any>): boolean {
  const lngField = findKey(value, ['longitude', 'lng', 'lon', 'x', '经度'])
  const latField = findKey(value, ['latitude', 'lat', 'y', '纬度'])
  if (!lngField || !latField) return false
  return isFiniteCoordinate(value[lngField]) && isFiniteCoordinate(value[latField])
}

function hasCoordinateArrayPair(value: Record<string, any>): boolean {
  const coordField = findKey(value, ['coordinates', 'coordinate', 'coord', '坐标'])
  if (!coordField) return false
  const coords = value[coordField]
  return Array.isArray(coords)
    && coords.length >= 2
    && isFiniteCoordinate(coords[0])
    && isFiniteCoordinate(coords[1])
}

function findKey(value: Record<string, any>, candidates: string[]): string | null {
  const entries = Object.keys(value)
  const lowerEntries = entries.map((entry) => entry.toLowerCase())
  for (const candidate of candidates) {
    const index = lowerEntries.indexOf(candidate.toLowerCase())
    if (index !== -1) return entries[index]
  }
  return null
}

function isFiniteCoordinate(value: unknown): boolean {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num)
}
