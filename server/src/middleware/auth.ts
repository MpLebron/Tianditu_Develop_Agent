import type { NextFunction, Request, Response } from 'express'
import { config } from '../config.js'
import { parseCookieHeader } from '../utils/cookies.js'
import { type AuthUser, verifySignedAuthToken } from '../utils/authToken.js'

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

function normalizeRedirectPath(value: string | undefined, fallback = '/workspace'): string {
  const trimmed = String(value || '').trim()
  if (!trimmed) return fallback
  if (!trimmed.startsWith('/')) return fallback
  if (trimmed.startsWith('//')) return fallback
  return trimmed
}

function deriveRedirectPath(req: Request): string {
  const referer = req.get('referer')
  if (referer) {
    try {
      const refererUrl = new URL(referer)
      const host = req.get('x-forwarded-host')?.split(',')[0]?.trim() || req.get('host') || ''
      if (!host || refererUrl.host === host) {
        return normalizeRedirectPath(`${refererUrl.pathname}${refererUrl.search}${refererUrl.hash}`)
      }
    } catch {
      // fallback below
    }
  }
  return '/workspace'
}

export function buildLoginUrl(req: Request, redirectPath?: string): string {
  const redirect = normalizeRedirectPath(redirectPath || deriveRedirectPath(req))
  return `${config.auth.loginPath}?redirect=${encodeURIComponent(redirect)}`
}

export function buildLogoutUrl(redirectPath = '/'): string {
  const redirect = normalizeRedirectPath(redirectPath, '/')
  return `${config.auth.logoutPath}?redirect=${encodeURIComponent(redirect)}`
}

export function resolveAuthUser(req: Request): AuthUser | null {
  if (!config.auth.enabled) return null
  if (req.user) return req.user
  const cookies = parseCookieHeader(req.headers.cookie)
  const token = cookies[config.auth.cookieName]
  const user = verifySignedAuthToken(token, config.auth.sharedSecret)
  if (user) req.user = user
  return user
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!config.auth.enabled) {
    next()
    return
  }

  const user = resolveAuthUser(req)
  if (user) {
    req.user = user
    next()
    return
  }

  res.status(401).json({
    success: false,
    error: '需要先登录统一用户中心',
    auth: {
      enabled: true,
      loginUrl: buildLoginUrl(req),
      logoutUrl: buildLogoutUrl('/'),
    },
  })
}
