import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import { extname } from 'path'
import { config } from '../config.js'

const storage = multer.diskStorage({
  destination: config.upload.dir,
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
