import express from 'express'
import { config } from '../config.js'
import { getRequestContext } from '../middleware/requestContext.js'
import { runDossierStore } from '../services/RunDossierStore.js'

const router = express.Router()

router.get('/', async (req, res, next) => {
  try {
    if (!config.runDossiers.enabled) {
      return res.json({ success: true, data: { total: 0, page: 1, pageSize: 20, items: [] } })
    }
    const page = Number(req.query.page || 1)
    const pageSize = Number(req.query.pageSize || 20)
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const phase = typeof req.query.phase === 'string' ? req.query.phase : undefined
    const result = await runDossierStore.listRuns({
      page,
      pageSize,
      status: status as any,
      phase: phase as any,
    })
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    if (!config.runDossiers.enabled) {
      return res.status(404).json({ success: false, error: '运行档案功能未启用' })
    }
    const record = await runDossierStore.getRun(String(req.params.id || ''))
    if (!record) {
      return res.status(404).json({ success: false, error: '运行档案不存在' })
    }
    res.json({ success: true, data: record })
  } catch (err) {
    next(err)
  }
})

router.post('/runtime-error', async (req, res, next) => {
  try {
    if (!config.runDossiers.enabled) {
      return res.json({ success: true, data: { recorded: false, reason: 'disabled' } })
    }

    const runId = String(req.body?.runId || '').trim()
    const message = String(req.body?.message || '').trim()
    if (!runId || !message) {
      return res.status(400).json({ success: false, error: '缺少 runId 或 message' })
    }

    const context = getRequestContext(req)
    const previewRunId = String(req.body?.previewRunId || '').trim()
    const kind = String(req.body?.kind || '').trim() || 'runtime'
    const src = String(req.body?.src || '').trim()
    const line = Number(req.body?.line || 0)
    const col = Number(req.body?.col || 0)
    const requestUrl = String(req.body?.requestUrl || '').trim()
    const method = String(req.body?.method || '').trim()
    const status = Number(req.body?.status || 0)
    const codeHash = String(req.body?.codeHash || '').trim()

    await runDossierStore.appendEvent(runId, {
      type: 'runtime_error',
      status: 'error',
      payload: {
        previewRunId,
        kind,
        src,
        line,
        col,
        requestUrl,
        method,
        status,
        codeHash,
        requestId: context.requestId,
        sessionId: context.sessionId,
      },
    })
    await runDossierStore.appendError(runId, {
      source: 'runtime',
      kind,
      message,
      markFailed: true,
      outcome: 'runtime_error',
      details: {
        previewRunId,
        src,
        line,
        col,
        requestUrl,
        method,
        status,
        codeHash,
        requestId: context.requestId,
        sessionId: context.sessionId,
      },
    })

    res.json({ success: true, data: { recorded: true } })
  } catch (err) {
    next(err)
  }
})

export default router
