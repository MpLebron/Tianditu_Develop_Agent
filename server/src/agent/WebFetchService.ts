import { lookup } from 'dns/promises'
import { isIP } from 'net'
import { config } from '../config.js'

export interface WebFetchResult {
  requestedUrl: string
  finalUrl: string
  status: number
  contentType: string
  title?: string
  excerpt: string
  truncated: boolean
}

export class WebFetchService {
  async fetchUrl(params: { url: string }): Promise<WebFetchResult> {
    const requested = new URL(params.url)
    await assertPublicUrl(requested)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), config.agentTools.fetch.timeoutMs)
    try {
      const response = await fetch(requested, {
        headers: {
          'user-agent': 'tianditu-smart-map/1.0',
          accept: 'text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.8',
        },
        signal: controller.signal,
        redirect: 'follow',
      })

      const finalUrl = new URL(response.url || params.url)
      await assertPublicUrl(finalUrl)

      const contentType = response.headers.get('content-type') || 'application/octet-stream'
      const payload = await readBodyWithLimit(response, config.agentTools.fetch.maxBytes)
      const excerpt = summarizeFetchedBody(payload.text, contentType)
      const title = extractTitle(payload.text, contentType)

      return {
        requestedUrl: requested.toString(),
        finalUrl: finalUrl.toString(),
        status: response.status,
        contentType,
        title: title || undefined,
        excerpt,
        truncated: payload.truncated,
      }
    } finally {
      clearTimeout(timeout)
    }
  }
}

export async function assertPublicUrl(url: URL): Promise<void> {
  if (!/^https?:$/.test(url.protocol)) {
    throw new Error(`不支持的 URL 协议: ${url.protocol}`)
  }

  const hostname = url.hostname.trim().toLowerCase()
  if (!hostname) {
    throw new Error('URL 缺少主机名')
  }

  if (isBlockedHostname(hostname)) {
    throw new Error(`禁止访问内网或本地地址: ${hostname}`)
  }

  if (isIP(hostname) && isPrivateIp(hostname)) {
    throw new Error(`禁止访问私有 IP: ${hostname}`)
  }

  if (!isIP(hostname)) {
    const records = await lookup(hostname, { all: true, verbatim: true })
    for (const record of records) {
      if (isPrivateIp(record.address)) {
        throw new Error(`禁止访问解析到私有 IP 的地址: ${hostname}`)
      }
    }
  }
}

export function isPrivateIp(ip: string): boolean {
  const version = isIP(ip)
  if (version === 4) return isPrivateIpv4(ip)
  if (version === 6) return isPrivateIpv6(ip)
  return false
}

function isBlockedHostname(hostname: string): boolean {
  return hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || hostname.endsWith('.internal')
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false

  if (parts[0] === 10) return true
  if (parts[0] === 127) return true
  if (parts[0] === 0) return true
  if (parts[0] === 169 && parts[1] === 254) return true
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
  if (parts[0] === 192 && parts[1] === 168) return true
  if (parts[0] >= 224) return true

  return false
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase()
  return lower === '::1'
    || lower.startsWith('fc')
    || lower.startsWith('fd')
    || lower.startsWith('fe80:')
    || lower.startsWith('::ffff:127.')
}

async function readBodyWithLimit(response: Response, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  const reader = response.body?.getReader()
  if (!reader) {
    return { text: '', truncated: false }
  }

  const decoder = new TextDecoder()
  const chunks: Uint8Array[] = []
  let total = 0
  let truncated = false

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue

    if (total + value.byteLength > maxBytes) {
      const remain = Math.max(0, maxBytes - total)
      if (remain > 0) {
        chunks.push(value.slice(0, remain))
        total += remain
      }
      truncated = true
      await reader.cancel()
      break
    }

    chunks.push(value)
    total += value.byteLength
  }

  const text = chunks.map((chunk) => decoder.decode(chunk, { stream: true })).join('') + decoder.decode()
  return { text, truncated }
}

function summarizeFetchedBody(body: string, contentType: string): string {
  const lower = contentType.toLowerCase()
  if (lower.includes('application/json') || looksLikeJson(body)) {
    const parsed = tryParseJson(body)
    if (parsed != null) {
      return JSON.stringify(sanitizeJson(parsed), null, 2)
    }
  }

  if (lower.includes('text/html') || /<html\b/i.test(body)) {
    return collapseWhitespace(
      body
        .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
        .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
        .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, '\'')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>'),
    ).slice(0, 4000)
  }

  return collapseWhitespace(body).slice(0, 4000)
}

function extractTitle(body: string, contentType: string): string {
  if (!(contentType.toLowerCase().includes('text/html') || /<html\b/i.test(body))) return ''
  const match = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return collapseWhitespace(match?.[1] || '')
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim()
  return trimmed.startsWith('{') || trimmed.startsWith('[')
}

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function sanitizeJson(value: unknown, depth = 0): unknown {
  if (value == null) return value
  if (typeof value === 'string') return value.length > 200 ? `${value.slice(0, 200)}...` : value
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) {
    return value.slice(0, 6).map((item) => sanitizeJson(item, depth + 1))
  }
  if (typeof value === 'object') {
    if (depth >= 4) return '[Object]'
    const output: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value).slice(0, 12)) {
      output[key] = sanitizeJson(item, depth + 1)
    }
    return output
  }
  return String(value)
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}
