import { Router } from 'express'
import { upload } from '../middleware/upload.js'
import { FileParser } from '../services/FileParser.js'

const router = Router()
const fileParser = new FileParser()

// POST /api/upload — 文件上传
router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '未上传文件' })
    }

    const parsed = await fileParser.parse(req.file.path)

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
      },
    })
  } catch (err) {
    next(err)
  }
})

export default router
