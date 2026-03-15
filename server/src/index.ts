import express from 'express'
import cors from 'cors'
import { config } from './config.js'
import { errorHandler } from './middleware/errorHandler.js'
import { requestContextMiddleware } from './middleware/requestContext.js'
import chatRouter from './routes/chat.js'
import uploadRouter from './routes/upload.js'
import tiandituRouter from './routes/tianditu.js'
import shareRouter from './routes/share.js'
import { mkdirSync } from 'fs'
import { resolve } from 'path'

// 确保上传目录存在
mkdirSync(config.upload.dir, { recursive: true })
// 确保分享目录存在
mkdirSync(config.share.dir, { recursive: true })
mkdirSync(resolve(config.share.dir, 'snapshots'), { recursive: true })

const app = express()

// 中间件
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(requestContextMiddleware)

// 静态文件（上传的文件）
app.use('/uploads', express.static(config.upload.dir))
// 分享快照静态资源
app.use('/share-assets', express.static(resolve(config.share.dir, 'snapshots'), {
  setHeaders: (res, filePath) => {
    if (/thumbnail\.(png|svg)$/i.test(filePath) || /\/index\.html$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      res.setHeader('Pragma', 'no-cache')
      res.setHeader('Expires', '0')
    }
  },
}))

// 路由
app.use('/api/chat', chatRouter)
app.use('/api/upload', uploadRouter)
app.use('/api/tianditu', tiandituRouter)
app.use('/api/share', shareRouter)

// 健康检查
app.get('/', (_req, res) => {
  res.json({ status: 'ok', name: '天地图智能开发平台', env: config.nodeEnv })
})
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', env: config.nodeEnv })
})

// 错误处理
app.use(errorHandler)

// 启动
app.listen(config.port, '0.0.0.0', () => {
  console.log(`[Server] 天地图智能开发平台后端启动`)
  console.log(`[Server] http://localhost:${config.port}`)
  console.log(`[Server] 环境: ${config.nodeEnv}`)
  console.log(`[Server] 模型提供商: ${config.llm.provider}`)
  console.log(`[Server] 模型: ${config.llm.model}`)
})
