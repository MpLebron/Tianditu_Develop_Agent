export type Position = [number, number]

export interface PolygonGeometry {
  type: 'Polygon'
  coordinates: Position[][]
}

export interface MultiPolygonGeometry {
  type: 'MultiPolygon'
  coordinates: Position[][][]
}

export type BoundaryGeometry = PolygonGeometry | MultiPolygonGeometry

function splitTopLevel(input: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]
    if (ch === '(') depth += 1
    else if (ch === ')') depth -= 1
    else if (ch === ',' && depth === 0) {
      out.push(input.slice(start, i).trim())
      start = i + 1
    }
  }

  const tail = input.slice(start).trim()
  if (tail) out.push(tail)
  return out
}

function trimOnePairParens(input: string): string {
  const s = input.trim()
  if (!s.startsWith('(') || !s.endsWith(')')) return s

  let depth = 0
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i]
    if (ch === '(') depth += 1
    else if (ch === ')') depth -= 1
    if (depth === 0 && i < s.length - 1) return s
  }
  return s.slice(1, -1).trim()
}

function parsePosition(raw: string): Position | null {
  const parts = raw.trim().split(/\s+/)
  if (parts.length < 2) return null
  const lng = Number(parts[0])
  const lat = Number(parts[1])
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  return [lng, lat]
}

function ensureRingClosed(ring: Position[]): Position[] {
  if (ring.length < 2) return ring
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] === last[0] && first[1] === last[1]) return ring
  return [...ring, [first[0], first[1]]]
}

function parseRing(raw: string): Position[] {
  const points = raw
    .split(',')
    .map(parsePosition)
    .filter((v): v is Position => Boolean(v))
  return ensureRingClosed(points)
}

function parsePolygonBody(body: string): Position[][] {
  const ringTokens = splitTopLevel(trimOnePairParens(body))
  const rings = ringTokens
    .map((token) => parseRing(trimOnePairParens(token)))
    .filter((ring) => ring.length >= 4)
  return rings
}

/**
 * 解析天地图行政区边界 WKT（POLYGON / MULTIPOLYGON）为 GeoJSON 几何对象。
 */
export function parseBoundaryWKT(boundary: string): BoundaryGeometry | null {
  if (!boundary || typeof boundary !== 'string') return null

  const raw = boundary.trim()
  const upper = raw.toUpperCase()

  if (upper.startsWith('POLYGON')) {
    const body = raw.slice(raw.indexOf('('))
    const rings = parsePolygonBody(body)
    if (!rings.length) return null
    return { type: 'Polygon', coordinates: rings }
  }

  if (upper.startsWith('MULTIPOLYGON')) {
    const body = trimOnePairParens(raw.slice(raw.indexOf('(')))
    const polygonTokens = splitTopLevel(body)
    const polygons = polygonTokens
      .map((token) => parsePolygonBody(token))
      .filter((rings) => rings.length > 0)
    if (!polygons.length) return null
    return { type: 'MultiPolygon', coordinates: polygons }
  }

  return null
}
