import { Router, type Request } from 'express'
import { upload } from '../middleware/upload.js'
import { FileParser } from '../services/FileParser.js'
import { getRequestContext } from '../middleware/requestContext.js'
import { normalizeStructuredRuntime, saveNormalizedStructuredData } from '../services/StructuredFileRuntime.js'

const router = Router()
const fileParser = new FileParser()

function buildAbsoluteFileUrl(req: Request, relativePath: string): string | undefined {
  const origin = req.get('origin')
  if (origin && /^https?:\/\//i.test(origin)) {
    try {
      return new URL(relativePath, origin).toString()
    } catch {
      // noop
    }
  }

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

// POST /api/upload — 文件上传
router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '未上传文件' })
    }

    const parsed = await fileParser.parse(req.file.path)
    const normalizedRuntime = normalizeStructuredRuntime(parsed)
    const sessionId = getRequestContext(req).sessionId
    const normalizedRelativeUrl = normalizedRuntime
      ? await saveNormalizedStructuredData({
        sessionId,
        normalizedData: normalizedRuntime.normalizedData,
        ext: normalizedRuntime.normalizedExt,
      })
      : null

    res.json({
      success: true,
      data: {
        filename: req.file.filename,
        originalname: req.file.originalname,
        size: req.file.size,
        type: parsed.type,
        headers: parsed.headers,
        rowCount: parsed.rows.length,
        summary: parsed.summary,
        preview: parsed.rows.slice(0, 5),
        normalizedUrl: normalizedRelativeUrl ? (buildAbsoluteFileUrl(req, normalizedRelativeUrl) || normalizedRelativeUrl) : null,
        rootShape: parsed.rootShape || null,
        encoding: parsed.encoding || null,
        runtimeKind: normalizedRuntime?.runtimeKind || null,
        topLevelKeys: parsed.rootShape === 'object' ? (parsed.topLevelKeys || []) : null,
      },
    })
  } catch (err) {
    next(err)
  }
})

export default router
