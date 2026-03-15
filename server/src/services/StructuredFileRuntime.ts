import { randomUUID } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import { dirname, relative, resolve, sep } from 'path'
import { config } from '../config.js'
import type { ParsedData } from './FileParser.js'
import { GeoJSONParser } from './GeoJSONParser.js'

export interface NormalizedStructuredRuntime {
  runtimeKind: 'json' | 'geojson'
  normalizedData: any
  normalizedExt: '.json' | '.geojson'
  source: 'json' | 'geojson' | 'table'
}

export function ensureFeatureCollection(geojson: any): any {
  if (!geojson || typeof geojson !== 'object') return geojson
  if (geojson.type === 'FeatureCollection') return geojson
  if (geojson.type === 'Feature') {
    return { type: 'FeatureCollection', features: [geojson] }
  }
  return geojson
}

export function normalizeStructuredRuntime(parsed: ParsedData): NormalizedStructuredRuntime | null {
  if (parsed.geojson) {
    const converted = GeoJSONParser.convertGeoJSON(parsed.geojson)
    return {
      runtimeKind: 'geojson',
      normalizedData: ensureFeatureCollection(converted),
      normalizedExt: '.geojson',
      source: 'geojson',
    }
  }

  if (parsed.type === 'json' && parsed.json !== undefined) {
    const geojson = parsed.rootShape === 'array'
      ? GeoJSONParser.fromTableData(parsed.rows)
      : null
    if (geojson) {
      return {
        runtimeKind: 'geojson',
        normalizedData: ensureFeatureCollection(GeoJSONParser.convertGeoJSON(geojson)),
        normalizedExt: '.geojson',
        source: 'table',
      }
    }

    return {
      runtimeKind: 'json',
      normalizedData: parsed.json,
      normalizedExt: '.json',
      source: 'json',
    }
  }

  return null
}

export async function saveNormalizedStructuredData(params: {
  sessionId: string
  normalizedData: any
  ext: '.json' | '.geojson'
}): Promise<string> {
  const normalizedName = `${randomUUID()}${params.ext}`
  const relativeUrl = `/uploads/${params.sessionId}/${normalizedName}`
  const filePath = resolve(config.upload.dir, params.sessionId, normalizedName)
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(params.normalizedData, null, 2), 'utf-8')
  return relativeUrl
}

export function buildUploadRelativeUrl(filePath: string): string {
  const relativePath = relative(resolve(config.upload.dir), resolve(filePath))
  const normalized = relativePath.split(sep).join('/')
  if (!normalized || normalized.startsWith('..')) {
    throw new Error('上传文件路径超出工作目录')
  }
  return `/uploads/${normalized}`
}
