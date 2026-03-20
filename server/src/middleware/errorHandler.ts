import type { Request, Response, NextFunction } from 'express'

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error('[Error]', err.message)

  const statusCode = resolveStatusCode(err)
  const message = resolveErrorMessage(err)

  res.status(statusCode).json({
    success: false,
    error: message,
  })
}

function resolveStatusCode(err: Error): number {
  const maybeStatus = (err as Error & { statusCode?: number }).statusCode
  if (typeof maybeStatus === 'number' && maybeStatus >= 400 && maybeStatus < 600) {
    return maybeStatus
  }

  if ((err as Error & { name?: string }).name === 'MulterError') {
    return 400
  }

  return 500
}

function resolveErrorMessage(err: Error): string {
  const multerError = err as Error & { name?: string; code?: string }
  if (multerError.name === 'MulterError' && multerError.code === 'LIMIT_FILE_SIZE') {
    return '上传文件过大，请压缩后再试。'
  }

  return err.message || '服务器内部错误'
}
