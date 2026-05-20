import { createHmac, timingSafeEqual } from 'crypto'

export interface AuthUser {
  sub: string
  loginName: string
  displayName?: string
  email?: string
  gbcode?: string
  companyName?: string
  userType?: number
}

interface SignedAuthPayload extends AuthUser {
  iat: number
  exp: number
}

function base64UrlEncode(input: Buffer | string): string {
  const source = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf-8')
  return source
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function base64UrlDecode(input: string): Buffer {
  const normalized = String(input || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  return Buffer.from(padded, 'base64')
}

function signEncodedPayload(payloadEncoded: string, secret: string): string {
  return base64UrlEncode(createHmac('sha256', secret).update(payloadEncoded).digest())
}

function toOptionalString(value: unknown, maxLen = 240): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, maxLen)
}

function toOptionalNumber(value: unknown): number | undefined {
  if (value == null || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function normalizePayload(value: unknown): SignedAuthPayload | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const sub = toOptionalString(raw.sub, 160)
  const loginName = toOptionalString(raw.loginName, 160)
  const iat = toOptionalNumber(raw.iat)
  const exp = toOptionalNumber(raw.exp)
  if (!sub || !loginName || !iat || !exp) return null

  return {
    sub,
    loginName,
    displayName: toOptionalString(raw.displayName, 160),
    email: toOptionalString(raw.email, 240),
    gbcode: toOptionalString(raw.gbcode, 80),
    companyName: toOptionalString(raw.companyName, 240),
    userType: toOptionalNumber(raw.userType),
    iat,
    exp,
  }
}

function toPublicUser(payload: SignedAuthPayload): AuthUser {
  return {
    sub: payload.sub,
    loginName: payload.loginName,
    displayName: payload.displayName,
    email: payload.email,
    gbcode: payload.gbcode,
    companyName: payload.companyName,
    userType: payload.userType,
  }
}

export function verifySignedAuthToken(token: string | undefined, secret: string): AuthUser | null {
  const raw = String(token || '').trim()
  if (!raw || !secret) return null

  const [payloadEncoded, signatureEncoded, extra] = raw.split('.')
  if (!payloadEncoded || !signatureEncoded || extra) return null

  const expectedSignature = signEncodedPayload(payloadEncoded, secret)
  const actualBuffer = Buffer.from(signatureEncoded, 'utf-8')
  const expectedBuffer = Buffer.from(expectedSignature, 'utf-8')
  if (actualBuffer.length !== expectedBuffer.length) return null
  if (!timingSafeEqual(actualBuffer, expectedBuffer)) return null

  try {
    const payloadJson = base64UrlDecode(payloadEncoded).toString('utf-8')
    const payload = normalizePayload(JSON.parse(payloadJson))
    if (!payload) return null
    const nowSeconds = Math.floor(Date.now() / 1000)
    if (payload.exp <= nowSeconds) return null
    return toPublicUser(payload)
  } catch {
    return null
  }
}
