import { randomUUID } from 'crypto'
import type { NextFunction, Request, Response } from 'express'
import { parseCookieHeader } from '../utils/cookies.js'

export interface RequestContext {
  requestId: string
  sessionId: string
}

declare global {
  namespace Express {
    interface Request {
      requestContext?: RequestContext
    }
  }
}

export const REQUEST_ID_HEADER = 'x-request-id'
export const SESSION_ID_HEADER = 'x-session-id'
export const SESSION_COOKIE_NAME = 'tdt_sid'
const SESSION_COOKIE_TTL_SECONDS = 60 * 60 * 24 * 30

function normalizeToken(value: string, maxLen: number): string {
  const normalized = String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '')
  return normalized.slice(0, maxLen)
}

function pickRequestId(req: Request): string {
  const headerValue = req.get(REQUEST_ID_HEADER)
  return normalizeToken(headerValue || '', 64) || randomUUID()
}

function pickSessionId(req: Request): string {
  const headerValue = normalizeToken(req.get(SESSION_ID_HEADER) || '', 64)
  if (headerValue) return headerValue

  const cookies = parseCookieHeader(req.headers.cookie)
  const cookieValue = normalizeToken(cookies[SESSION_COOKIE_NAME] || '', 64)
  if (cookieValue) return cookieValue

  return randomUUID()
}

export function getRequestContext(req: Request): RequestContext {
  if (req.requestContext) return req.requestContext
  req.requestContext = {
    requestId: pickRequestId(req),
    sessionId: pickSessionId(req),
  }
  return req.requestContext
}

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction) {
  const context = getRequestContext(req)
  const cookies = parseCookieHeader(req.headers.cookie)

  res.setHeader(REQUEST_ID_HEADER, context.requestId)
  res.setHeader(SESSION_ID_HEADER, context.sessionId)
  if (cookies[SESSION_COOKIE_NAME] !== context.sessionId) {
    res.cookie(SESSION_COOKIE_NAME, context.sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_COOKIE_TTL_SECONDS * 1000,
    })
  }

  next()
}
