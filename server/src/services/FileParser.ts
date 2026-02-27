import { readFile } from 'fs/promises'
import { extname } from 'path'
import * as XLSX from 'xlsx'

export interface ParsedData {
  type: 'csv' | 'excel' | 'geojson' | 'json'
  headers: string[]
  rows: Record<string, any>[]
  geojson?: any
  summary: string
}

/**
 * 文件解析器：CSV / Excel / GeoJSON
 */
export class FileParser {
  async parse(filePath: string): Promise<ParsedData> {
    const ext = extname(filePath).toLowerCase()

    if (ext === '.geojson' || ext === '.json') {
      return this.parseJSON(filePath)
    }
    if (ext === '.csv') {
      return this.parseCSV(filePath)
    }
    if (ext === '.xlsx' || ext === '.xls') {
      return this.parseExcel(filePath)
    }

    throw new Error(`不支持的文件格式: ${ext}`)
  }

  private async parseJSON(filePath: string): Promise<ParsedData> {
    const content = await readFile(filePath, 'utf-8')
    const data = JSON.parse(content)

    const directGeoJSON = this.asGeoJSON(data)
    if (directGeoJSON) {
      const features = directGeoJSON.type === 'FeatureCollection' ? directGeoJSON.features : [directGeoJSON]
      const headers = features.length > 0 ? Object.keys(features[0].properties || {}) : []
      return {
        type: 'geojson',
        headers,
        rows: features.map((f: any) => f.properties || {}),
        geojson: directGeoJSON,
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
        summary: `JSON 数据，${data.length} 条记录，字段: ${headers.slice(0, 5).join(', ')}`,
      }
    }

    return {
      type: 'json',
      headers: Object.keys(data),
      rows: [data],
      summary: `JSON 对象，字段: ${Object.keys(data).slice(0, 5).join(', ')}`,
    }
  }

  private asGeoJSON(value: any): any | null {
    if (!value || typeof value !== 'object') return null
    if (value.type === 'FeatureCollection' || value.type === 'Feature') return value
    return null
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

  private workbookToData(workbook: XLSX.WorkBook, type: 'csv' | 'excel'): ParsedData {
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
