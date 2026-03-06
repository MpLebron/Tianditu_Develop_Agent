import { Router, type Request } from 'express'
import { constants as fsConstants } from 'fs'
import { access, stat, writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { basename, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { MapAgent } from '../agent/MapAgent.js'
import { FileParser } from '../services/FileParser.js'
import { GeoJSONParser } from '../services/GeoJSONParser.js'
import { VisualRenderService } from '../services/VisualRenderService.js'
import { VisualInspectionService } from '../services/VisualInspectionService.js'
import { upload } from '../middleware/upload.js'
import { config } from '../config.js'
import {
  getCatalogDefaultSelection,
  getProviderCatalog,
  resolveLlmSelection,
  type LlmSelection,
} from '../provider/index.js'

const router = Router()
const agent = new MapAgent()
const fileParser = new FileParser()
const visualRenderService = new VisualRenderService({
  enabled: config.visualInspection.enabled,
  baseUrl: config.visualInspection.baseUrl,
  snapshotsDir: resolve(config.share.dir, 'snapshots'),
  chromiumPath: config.visualInspection.chromiumPath,
  timeoutMs: config.visualInspection.timeoutMs,
  waitAfterLoadMs: config.visualInspection.waitAfterLoadMs,
  viewportWidth: config.visualInspection.viewportWidth,
  viewportHeight: config.visualInspection.viewportHeight,
})
const visualInspectionService = new VisualInspectionService({
  timeoutMs: config.visualInspection.llmTimeoutMs,
})
const defaultLlmSelection = (() => {
  try {
    return resolveLlmSelection(
      { provider: config.llm.provider, model: config.llm.model },
      getCatalogDefaultSelection(),
    )
  } catch {
    return getCatalogDefaultSelection()
  }
})()

const SAMPLE_FEATURE_COUNT = 3
const SAMPLE_ROW_COUNT = 3
const MAX_SAMPLE_OBJECT_KEYS = 16
const MAX_SAMPLE_ARRAY_ITEMS = 8
const MAX_SAMPLE_DEPTH = 5
const MAX_SAMPLE_STRING_LEN = 160

const currentDir = dirname(fileURLToPath(import.meta.url))
const builtinSampleDir = resolve(currentDir, '../../assets/samples')

const BUILTIN_SAMPLE_FILES = {
  'village-renovation': resolve(builtinSampleDir, 'village-renovation.geojson'),
  'fulian-centers': resolve(builtinSampleDir, 'fulian-centers.geojson'),
  'china-flood-events': resolve(builtinSampleDir, 'china-flood-events.geojson'),
} as const

type BuiltinSampleId = keyof typeof BUILTIN_SAMPLE_FILES

/** 统一替换 token：占位符 + LLM 可能硬编码的任意 32 位 hex token */
function injectToken(code: string): string {
  const token = config.tiandituToken
  if (!token) return code
  // 替换占位符
  code = code.replace(/\$\{TIANDITU_TOKEN\}/g, token)
  code = code.replace(/\b(?:your_tianditu_token_here|YOUR_TIANDITU_TOKEN|YOUR_TIANDITU_API_KEY|your_tianditu_api_key)\b/g, token)
  // 替换 LLM 硬编码的任意 tk 值（CDN URL 中）
  code = code.replace(/(api\.tianditu\.gov\.cn\/api\/v5\/js\?tk=)[a-f0-9]{32}/g, `$1${token}`)
  // 兼容修复：部分模型会反复生成 style: 'default'，在当前天地图 v5.0 运行环境下可能触发底图 404（default）
  // 默认样式应省略 style 字段。
  code = code.replace(/(\s+)style\s*:\s*['"]default['"]\s*,/g, '$1')
  code = code.replace(/,\s*style\s*:\s*['"]default['"](\s*[}\]])/g, '$1')
  return code
}

function buildAbsoluteFileUrl(req: Request, relativePath: string): string | undefined {
  // 优先使用浏览器 Origin（经 Vite 代理转发时通常仍保留），这样更贴近页面实际运行的同源地址（如 :5173）
  const origin = req.get('origin')
  if (origin && /^https?:\/\//i.test(origin)) {
    try {
      return new URL(relativePath, origin).toString()
    } catch {
      // ignore and fallback
    }
  }

  // 其次使用代理头/Host 构建服务端绝对地址
  const forwardedProto = req.get('x-forwarded-proto')
  const proto = (forwardedProto?.split(',')[0]?.trim() || req.protocol || 'http')
  const host = req.get('host')
  if (!host) return undefined

  try {
    return new URL(relativePath, `${proto}://${host}`).toString()
  } catch {
    return undefined
  }
}

function ensureFeatureCollection(geojson: any): any {
  if (!geojson || typeof geojson !== 'object') return geojson
  if (geojson.type === 'FeatureCollection') return geojson
  if (geojson.type === 'Feature') {
    return { type: 'FeatureCollection', features: [geojson] }
  }
  return geojson
}

async function saveNormalizedGeoJSON(req: Request, geojson: any): Promise<string> {
  const normalizedName = `${randomUUID()}.geojson`
  const relativeUrl = `/uploads/${normalizedName}`
  const filePath = `${config.upload.dir}/${normalizedName}`
  await writeFile(filePath, JSON.stringify(geojson), 'utf-8')
  return buildAbsoluteFileUrl(req, relativeUrl) || relativeUrl
}

function truncateText(value: string, maxLen = MAX_SAMPLE_STRING_LEN): string {
  if (value.length <= maxLen) return value
  return `${value.slice(0, maxLen)}…(truncated, ${value.length} chars)`
}

function roundNum(n: number): number {
  return Number.isFinite(n) ? Number(n.toFixed(6)) : n
}

function summarizeCoordinates(coords: any, depth = 0): any {
  if (coords == null) return coords
  if (typeof coords === 'number') return roundNum(coords)
  if (!Array.isArray(coords)) return coords

  // 几何坐标数组通常层级较深；逐层收缩，避免多边形坐标把 token 撑爆
  const limitsByDepth = [2, 3, 6, 2] // polygon/multipolygon: 多边形数 / ring 数 / 点数 / [lng,lat]
  const limit = limitsByDepth[Math.min(depth, limitsByDepth.length - 1)]
  const sliced = coords.slice(0, limit).map((item) => summarizeCoordinates(item, depth + 1))
  if (coords.length > limit) {
    sliced.push(`...(${coords.length - limit} more items)`)
  }
  return sliced
}

function extractFirstCoordinateFromGeometry(geometry: any): [number, number] | null {
  const walk = (coords: any): [number, number] | null => {
    if (!Array.isArray(coords)) return null
    if (
      coords.length >= 2 &&
      typeof coords[0] === 'number' &&
      typeof coords[1] === 'number' &&
      Number.isFinite(coords[0]) &&
      Number.isFinite(coords[1])
    ) {
      return [roundNum(coords[0]), roundNum(coords[1])]
    }
    for (const item of coords) {
      const found = walk(item)
      if (found) return found
    }
    return null
  }

  if (!geometry || typeof geometry !== 'object') return null
  return walk((geometry as any).coordinates)
}

function sanitizeForSample(value: any, depth = 0): any {
  if (value == null) return value
  if (typeof value === 'string') return truncateText(value)
  if (typeof value === 'number') return roundNum(value)
  if (typeof value === 'boolean') return value

  if (Array.isArray(value)) {
    const limit = MAX_SAMPLE_ARRAY_ITEMS
    const arr = value.slice(0, limit).map((v) => sanitizeForSample(v, depth + 1))
    if (value.length > limit) arr.push(`...(${value.length - limit} more items)`)
    return arr
  }

  if (typeof value === 'object') {
    if (depth >= MAX_SAMPLE_DEPTH) return '[Object truncated]'
    const entries = Object.entries(value)
    const out: Record<string, any> = {}
    for (const [k, v] of entries.slice(0, MAX_SAMPLE_OBJECT_KEYS)) {
      out[k] = sanitizeForSample(v, depth + 1)
    }
    if (entries.length > MAX_SAMPLE_OBJECT_KEYS) {
      out.__truncatedKeys = `${entries.length - MAX_SAMPLE_OBJECT_KEYS} more keys`
    }
    return out
  }

  return String(value)
}

function countCoordinatePairs(coords: any): number {
  if (!Array.isArray(coords)) return 0
  if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') return 1
  let count = 0
  for (const item of coords) count += countCoordinatePairs(item)
  return count
}

function summarizeFeatureForSample(feature: any): any {
  if (!feature || typeof feature !== 'object') return sanitizeForSample(feature)

  const firstCoordinate = extractFirstCoordinateFromGeometry(feature.geometry)
  const geometry = feature.geometry && typeof feature.geometry === 'object'
    ? {
      type: feature.geometry.type,
      pointCount: countCoordinatePairs(feature.geometry.coordinates),
      firstCoordinate,
      coordinates: summarizeCoordinates(feature.geometry.coordinates),
    }
    : feature.geometry

  return {
    type: feature.type || 'Feature',
    id: feature.id ?? undefined,
    properties: sanitizeForSample(feature.properties || {}),
    geometry,
  }
}

function getGeometryTypeStats(features: any[]): Record<string, number> {
  const stats: Record<string, number> = {}
  for (const feature of features || []) {
    const t = feature?.geometry?.type || 'Unknown'
    stats[t] = (stats[t] || 0) + 1
  }
  return stats
}

function buildGeojsonContract(params: {
  geojsonPath: string
  featureCollection: any
}): string {
  const features = Array.isArray(params.featureCollection?.features)
    ? params.featureCollection.features
    : []

  const contract = {
    version: 'geojson-contract-v1',
    geojsonPath: params.geojsonPath,
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
      '传入 map.addSource 的 data 必须是 FeatureCollection/Feature 对象',
    ],
  }

  return [
    '数据契约(JSON，运行时优先遵循):',
    JSON.stringify(contract, null, 2),
    '运行时强约束:',
    '- 运行时禁止字段: coordinatesPreview',
    '- Point/MultiPoint 提取规则: Point 用 geometry.coordinates；MultiPoint 用 geometry.coordinates[0]',
    '- 访问 [0] 前必须先判空：Array.isArray(x) && x.length > 0',
  ].join('\n')
}

function buildGeojsonFileContext(params: {
  fileName: string
  fileUrl: string
  originalSummaryLine: string
  normalizedGeoJSON: any
}): string {
  const featureSamples = Array.isArray(params.normalizedGeoJSON?.features)
    ? params.normalizedGeoJSON.features.slice(0, SAMPLE_FEATURE_COUNT).map(summarizeFeatureForSample)
    : []
  const contract = buildGeojsonContract({
    geojsonPath: 'rawData',
    featureCollection: params.normalizedGeoJSON,
  })

  return [
    `文件: ${params.fileName}`,
    `文件获取链接URL: ${params.fileUrl}`,
    '返回结构: 标准 GeoJSON FeatureCollection',
    'GeoJSON提取路径: rawData',
    `原始文件结构说明: ${params.originalSummaryLine}`,
    contract,
    `GeoJSON 数据样例（前 ${SAMPLE_FEATURE_COUNT} 个要素，已截断长字段/坐标）:`,
    JSON.stringify(featureSamples, null, 2),
  ].join('\n')
}

/** 解析上传的文件为文本摘要（含文件访问 URL） */
async function parseUploadedFile(file: Express.Multer.File, req: Request): Promise<string | undefined> {
  try {
    const parsed = await fileParser.parse(file.path)
    // 构建原始文件 URL（仅兜底使用）
    const rawFileUrl = `/uploads/${file.filename}`
    const rawPreferredFileUrl = buildAbsoluteFileUrl(req, rawFileUrl) || rawFileUrl

    if (parsed.geojson) {
      const converted = GeoJSONParser.convertGeoJSON(parsed.geojson)
      const normalizedGeoJSON = ensureFeatureCollection(converted)
      const normalizedFileUrl = await saveNormalizedGeoJSON(req, normalizedGeoJSON)
      const originalSummaryLine = parsed.summary.split('\n')[0] || parsed.summary
      return buildGeojsonFileContext({
        fileName: file.originalname,
        fileUrl: normalizedFileUrl,
        originalSummaryLine,
        normalizedGeoJSON,
      })
    } else {
      const geojson = GeoJSONParser.fromTableData(parsed.rows)
      const rowSamples = parsed.rows.slice(0, SAMPLE_ROW_COUNT).map((row) => sanitizeForSample(row))
      const normalizedTableGeojson = geojson
        ? ensureFeatureCollection(GeoJSONParser.convertGeoJSON(geojson))
        : null
      const normalizedFileUrl = normalizedTableGeojson
        ? await saveNormalizedGeoJSON(req, normalizedTableGeojson)
        : null
      let result = [
        `文件: ${file.originalname}`,
        `文件获取链接URL: ${normalizedFileUrl || rawPreferredFileUrl}`,
        ...(normalizedFileUrl
          ? [
            '返回结构: 标准 GeoJSON FeatureCollection',
            'GeoJSON提取路径: rawData',
            '来源: 由表格数据自动转换生成规范化 GeoJSON',
            buildGeojsonContract({
              geojsonPath: 'rawData',
              featureCollection: normalizedTableGeojson,
            }),
          ]
          : []),
        parsed.summary,
        `前 ${SAMPLE_ROW_COUNT} 行数据（已截断长字段）:`,
        JSON.stringify(rowSamples, null, 2),
      ].join('\n')
      if (geojson) {
        result += `\n\n自动检测到经纬度字段，已生成 GeoJSON（${geojson.features.length} 个点）`
      }
      return result
    }
  } catch (err: any) {
    return `文件解析失败: ${err.message}`
  }
}

async function parseBuiltinSampleFile(sampleId: BuiltinSampleId, req: Request): Promise<string> {
  const filePath = BUILTIN_SAMPLE_FILES[sampleId]
  await access(filePath, fsConstants.R_OK)
  const parsed = await fileParser.parse(filePath)
  const fileName = basename(filePath)

  if (parsed.geojson) {
    const converted = GeoJSONParser.convertGeoJSON(parsed.geojson)
    const normalizedGeoJSON = ensureFeatureCollection(converted)
    const normalizedFileUrl = await saveNormalizedGeoJSON(req, normalizedGeoJSON)
    const originalSummaryLine = parsed.summary.split('\n')[0] || parsed.summary
    return buildGeojsonFileContext({
      fileName,
      fileUrl: normalizedFileUrl,
      originalSummaryLine,
      normalizedGeoJSON,
    })
  }

  const geojson = GeoJSONParser.fromTableData(parsed.rows)
  const rowSamples = parsed.rows.slice(0, SAMPLE_ROW_COUNT).map((row) => sanitizeForSample(row))
  const normalizedTableGeojson = geojson
    ? ensureFeatureCollection(GeoJSONParser.convertGeoJSON(geojson))
    : null
  const normalizedFileUrl = normalizedTableGeojson
    ? await saveNormalizedGeoJSON(req, normalizedTableGeojson)
    : null
  return [
    `文件: ${fileName}`,
    `文件获取链接URL: ${normalizedFileUrl || 'N/A'}`,
    ...(normalizedFileUrl
      ? [
        '返回结构: 标准 GeoJSON FeatureCollection',
        'GeoJSON提取路径: rawData',
        '来源: 由表格数据自动转换生成规范化 GeoJSON',
        buildGeojsonContract({
          geojsonPath: 'rawData',
          featureCollection: normalizedTableGeojson,
        }),
      ]
      : []),
    parsed.summary,
    `前 ${SAMPLE_ROW_COUNT} 行数据（已截断长字段）:`,
    JSON.stringify(rowSamples, null, 2),
  ].join('\n')
}

function resolveRequestLlmSelection(body: any): LlmSelection {
  return resolveLlmSelection(
    {
      provider: typeof body?.provider === 'string' ? body.provider : undefined,
      model: typeof body?.model === 'string' ? body.model : undefined,
    },
    defaultLlmSelection,
  )
}

function visualInspectUnavailable(reason: string) {
  return {
    status: 'unavailable' as const,
    anomalous: false,
    shouldRepair: false,
    severity: 'low' as const,
    summary: '视觉巡检不可用',
    diagnosis: reason || '视觉巡检暂时不可用。',
    repairHint: '无',
    confidence: 0,
    model: 'gpt-4.1-nano',
  }
}

function isBlankLikeDiagnosis(text: string): boolean {
  const value = String(text || '').toLowerCase()
  return /空白|未显示|没有显示|无内容|未渲染|blank|empty|not rendered|no data/.test(value)
}

function normalizeVisualInspectByCaptureMeta(
  inspected: any,
  captureMeta: {
    mode?: string
    canvasCount?: number
    largestCanvasArea?: number
    canvasReadable?: boolean
    canvasTainted?: boolean
  } | null,
) {
  if (!captureMeta) return inspected
  if (inspected.status !== 'ok' || inspected.anomalous !== true) return inspected

  const likelyCanvasMap = Number(captureMeta.canvasCount || 0) > 0 && Number(captureMeta.largestCanvasArea || 0) >= 120000
  const tainted = captureMeta.canvasTainted === true && captureMeta.canvasReadable !== true
  const blankLike = isBlankLikeDiagnosis(`${inspected.summary}\n${inspected.diagnosis}`)
  if (!(likelyCanvasMap && tainted && blankLike)) return inspected

  return visualInspectUnavailable('前端截图受跨域画布限制影响，当前截图无法可靠反映地图渲染内容。')
}

// GET /api/chat/models — 多模型提供商与模型列表
router.get('/models', (_req, res) => {
  res.json({
    success: true,
    data: {
      providers: getProviderCatalog(),
      defaultSelection: defaultLlmSelection,
      baseUrl: config.llm.baseUrl,
    },
  })
})

// POST /api/chat/visual-inspect — 地图视觉巡检
router.post('/visual-inspect', async (req, res) => {
  const rawCode = typeof req.body?.code === 'string' ? req.body.code : ''
  const rawImageBase64 = typeof req.body?.imageBase64 === 'string' ? req.body.imageBase64 : ''
  const hint = typeof req.body?.hint === 'string' ? req.body.hint : ''
  const runId = typeof req.body?.runId === 'string' ? req.body.runId : ''
  const captureMeta = typeof req.body?.captureMeta === 'object' && req.body.captureMeta
    ? req.body.captureMeta as {
        mode?: string
        canvasCount?: number
        largestCanvasArea?: number
        canvasReadable?: boolean
        canvasTainted?: boolean
      }
    : null

  if (!rawCode.trim() && !rawImageBase64.trim()) {
    res.status(400).json({ success: false, error: '缺少可巡检内容（代码或截图）' })
    return
  }

  const maxCodeChars = Number.isFinite(config.visualInspection.maxCodeChars)
    ? Math.max(10000, config.visualInspection.maxCodeChars)
    : 400000
  const code = injectToken(rawCode.length > maxCodeChars ? rawCode.slice(0, maxCodeChars) : rawCode)
  const imageBase64 = rawImageBase64.trim()

  try {
    let finalImageBase64 = imageBase64
    if (!finalImageBase64) {
      const rendered = await visualRenderService.render({ code, runId })
      if (!rendered.ok || !rendered.imageBase64) {
        res.json({
          success: true,
          data: visualInspectUnavailable(rendered.reason || '地图截图失败。'),
        })
        return
      }
      finalImageBase64 = rendered.imageBase64
    }

    const inspected = await visualInspectionService.inspect({
      imageBase64: finalImageBase64,
      hint,
      runId,
    })
    res.json({
      success: true,
      data: normalizeVisualInspectByCaptureMeta(inspected, captureMeta),
    })
  } catch (err: any) {
    res.json({
      success: true,
      data: visualInspectUnavailable(err?.message || '视觉巡检失败。'),
    })
  }
})

// POST /api/chat/sample-context — 预加载首页案例数据并返回 fileContext
router.post('/sample-context', async (req, res) => {
  const sampleId = req.body?.sampleId as BuiltinSampleId | undefined
  if (!sampleId || !(sampleId in BUILTIN_SAMPLE_FILES)) {
    res.status(400).json({ success: false, error: '无效的样例 ID' })
    return
  }

  try {
    const samplePath = BUILTIN_SAMPLE_FILES[sampleId]
    const fileContext = await parseBuiltinSampleFile(sampleId, req)
    const fileStat = await stat(samplePath)
    res.json({
      success: true,
      data: {
        sampleId,
        fileContext,
        file: {
          name: basename(samplePath),
          size: fileStat.size,
        },
      },
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || '样例数据加载失败' })
  }
})

// POST /api/chat/stream — 流式聊天接口 (SSE)
router.post('/stream', upload.single('file'), async (req, res) => {
  const { message, conversationHistory, existingCode, fileContext } = req.body

  if (!message) {
    res.status(400).json({ success: false, error: '请输入消息' })
    return
  }

  let llmSelection: LlmSelection
  try {
    llmSelection = resolveRequestLlmSelection(req.body)
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message || '模型参数无效' })
    return
  }

  // SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // 关闭 nginx/proxy 缓冲
  res.flushHeaders()

  // 检测客户端断开（监听 response 的 close，而非 request 的 close）
  let clientDisconnected = false
  res.on('close', () => { clientDisconnected = true })

  try {
    const uploadedFileData = req.file ? await parseUploadedFile(req.file, req) : undefined
    const fileData = uploadedFileData || (typeof fileContext === 'string' && fileContext.trim() ? fileContext : undefined)

    if (!clientDisconnected && uploadedFileData) {
      res.write(`data: ${JSON.stringify({ type: 'file_context', content: uploadedFileData })}\n\n`)
    }

    const stream = agent.invokeStream({
      userInput: message,
      fileData,
      conversationHistory,
      existingCode,
      llmSelection,
    })

    for await (const chunk of stream) {
      if (clientDisconnected) break

      let data = chunk
      // 对 code 类型注入 token
      if (chunk.type === 'code' && chunk.content) {
        data = { ...chunk, content: injectToken(chunk.content) }
      }
      res.write(`data: ${JSON.stringify(data)}\n\n`)
    }

    if (!clientDisconnected) {
      res.write('data: [DONE]\n\n')
    }
    res.end()
  } catch (err: any) {
    if (!clientDisconnected) {
      res.write(`data: ${JSON.stringify({ type: 'error', content: err.message })}\n\n`)
      res.write('data: [DONE]\n\n')
    }
    res.end()
  }
})

// POST /api/chat — 非流式聊天接口（保留兼容）
router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    const { message, conversationHistory, existingCode, fileContext } = req.body

    if (!message) {
      return res.status(400).json({ success: false, error: '请输入消息' })
    }

    let llmSelection: LlmSelection
    try {
      llmSelection = resolveRequestLlmSelection(req.body)
    } catch (err: any) {
      return res.status(400).json({ success: false, error: err?.message || '模型参数无效' })
    }
    const uploadedFileData = req.file ? await parseUploadedFile(req.file, req) : undefined
    const fileData = uploadedFileData || (typeof fileContext === 'string' && fileContext.trim() ? fileContext : undefined)

    const result = await agent.invoke({
      userInput: message,
      fileData,
      conversationHistory,
      existingCode,
      llmSelection,
    })

    // 替换 token
    let code = result.code
    if (code) {
      code = injectToken(code)
    }

    res.json({
      success: true,
      data: {
        code,
        response: result.response,
        error: result.error,
        fileContext: uploadedFileData || undefined,
      },
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/chat/fix — 代码修复
router.post('/fix', async (req, res, next) => {
  try {
    const { code, error, userInput, fileContext } = req.body

    if (!code || !error) {
      return res.status(400).json({ success: false, error: '缺少代码或错误信息' })
    }

    let llmSelection: LlmSelection
    try {
      llmSelection = resolveRequestLlmSelection(req.body)
    } catch (err: any) {
      return res.status(400).json({ success: false, error: err?.message || '模型参数无效' })
    }
    const result = await agent.fixCode({
      code,
      error,
      userInput: userInput || '',
      fileData: typeof fileContext === 'string' && fileContext.trim() ? fileContext : undefined,
      llmSelection,
    })

    let fixedCode = result.code
    if (fixedCode) {
      fixedCode = injectToken(fixedCode)
    }

    res.json({
      success: true,
      data: {
        code: fixedCode,
        explanation: result.explanation,
        fixed: result.fixed,
      },
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/chat/fix/stream — 流式代码修复（用于前端展示修复过程）
router.post('/fix/stream', async (req, res) => {
  const { code, error, userInput, fileContext } = req.body

  if (!code || !error) {
    res.status(400).json({ success: false, error: '缺少代码或错误信息' })
    return
  }

  let llmSelection: LlmSelection
  try {
    llmSelection = resolveRequestLlmSelection(req.body)
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message || '模型参数无效' })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  let clientDisconnected = false
  res.on('close', () => { clientDisconnected = true })

  try {
    const stream = agent.fixCodeStream({
      code,
      error,
      userInput: userInput || '',
      fileData: typeof fileContext === 'string' && fileContext.trim() ? fileContext : undefined,
      llmSelection,
    })

    for await (const chunk of stream) {
      if (clientDisconnected) break

      let data = chunk
      if (chunk.type === 'code' && chunk.content) {
        data = { ...chunk, content: injectToken(chunk.content) }
      }
      res.write(`data: ${JSON.stringify(data)}\n\n`)
    }

    if (!clientDisconnected) {
      res.write('data: [DONE]\n\n')
    }
    res.end()
  } catch (err: any) {
    if (!clientDisconnected) {
      res.write(`data: ${JSON.stringify({ type: 'error', content: err.message })}\n\n`)
      res.write('data: [DONE]\n\n')
    }
    res.end()
  }
})

export default router
