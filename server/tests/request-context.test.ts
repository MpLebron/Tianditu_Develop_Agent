import { describe, expect, it } from 'vitest'
import type { Request, Response } from 'express'
import {
  REQUEST_ID_HEADER,
  SESSION_COOKIE_NAME,
  SESSION_ID_HEADER,
  getRequestContext,
  requestContextMiddleware,
} from '../src/middleware/requestContext.js'

function createReq(headers: Record<string, string> = {}): Request {
  const normalized: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) normalized[key.toLowerCase()] = value

  return {
    headers: normalized,
    get(name: string) {
      return normalized[name.toLowerCase()]
    },
  } as unknown as Request
}

function createRes() {
  const headers: Record<string, string> = {}
  let cookieArgs: any[] | null = null

  const res = {
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value
      return this
    },
    cookie(...args: any[]) {
      cookieArgs = args
      return this
    },
  } as unknown as Response

  return {
    res,
    headers,
    get cookieArgs() {
      return cookieArgs
    },
  }
}

describe('request context middleware', () => {
  it('reuses header and cookie ids when provided', () => {
    const req = createReq({
      [REQUEST_ID_HEADER]: 'req-123',
      cookie: `${SESSION_COOKIE_NAME}=sid-456`,
    })

    const context = getRequestContext(req)
    expect(context.requestId).toBe('req-123')
    expect(context.sessionId).toBe('sid-456')
  })

  it('sets request/session headers and cookie', () => {
    const req = createReq()
    const holder = createRes()
    const { res, headers } = holder
    let called = false

    requestContextMiddleware(req, res, () => {
      called = true
    })

    expect(called).toBe(true)
    expect(headers[REQUEST_ID_HEADER]).toBeTruthy()
    expect(headers[SESSION_ID_HEADER]).toBeTruthy()
    expect(holder.cookieArgs?.[0]).toBe(SESSION_COOKIE_NAME)
    expect(String(holder.cookieArgs?.[1] || '')).toBeTruthy()
  })
})
