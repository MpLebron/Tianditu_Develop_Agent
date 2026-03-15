import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import { mkdir } from 'fs/promises'
import { extname, resolve } from 'path'
import { config } from '../config.js'
import { getRequestContext } from './requestContext.js'

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const sessionId = getRequestContext(req).sessionId
    const targetDir = resolve(config.upload.dir, sessionId)
    mkdir(targetDir, { recursive: true })
      .then(() => cb(null, targetDir))
      .catch((err) => cb(err, targetDir))
  },
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname)
    cb(null, `${uuidv4()}${ext}`)
  },
})

export const upload = multer({
  storage,
  limits: { fileSize: config.upload.maxFileSize },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.csv', '.xlsx', '.xls', '.json', '.geojson']
    const ext = extname(file.originalname).toLowerCase()
    if (allowed.includes(ext)) {
      cb(null, true)
    } else {
      cb(new Error(`不支持的文件格式: ${ext}`))
    }
  },
})
