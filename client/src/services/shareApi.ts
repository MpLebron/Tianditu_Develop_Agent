import type { ShareCreateResult, ShareItem, SharePublicListResult, ShareSuggestResult, ShareVisibility } from '../types/share'

interface ApiSuccess<T> {
  success: true
  data: T
}

interface ApiFailure {
  success: false
  error: string
}

interface ShareSuggestStreamEvent extends ShareSuggestResult {
  type: 'suggestion_delta'
  done?: boolean
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init)
  const json = (await response.json()) as ApiSuccess<T> | ApiFailure
  if (!response.ok || !json.success) {
    const message = 'error' in json ? json.error : `HTTP ${response.status}`
    throw new Error(message || '请求失败')
  }
  return json.data
}

function isLocalLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

function normalizeShareAssetUrl(raw: string): string {
  if (!raw) return raw
  if (typeof window === 'undefined') return raw

  try {
    const url = new URL(raw, window.location.origin)
    if (url.pathname.startsWith('/share-assets/')) {
      return `${window.location.origin}${url.pathname}${url.search}${url.hash}`
    }
    if (isLocalLoopback(url.hostname) && !isLocalLoopback(window.location.hostname)) {
      return `${window.location.protocol}//${window.location.host}${url.pathname}${url.search}${url.hash}`
    }
    return url.toString()
  } catch {
    return raw
  }
}

function normalizeSharePageUrl(raw: string): string {
  if (!raw) return raw
  if (typeof window === 'undefined') return raw

  try {
    const url = new URL(raw, window.location.origin)
    if (url.pathname.startsWith('/share/')) {
      return `${window.location.origin}${url.pathname}${url.search}${url.hash}`
    }
    if (isLocalLoopback(url.hostname) && !isLocalLoopback(window.location.hostname)) {
      return `${window.location.protocol}//${window.location.host}${url.pathname}${url.search}${url.hash}`
    }
    return url.toString()
  } catch {
    return raw
  }
}

function normalizeShareItem<T extends ShareItem>(item: T): T {
  return {
    ...item,
    htmlUrl: normalizeShareAssetUrl(item.htmlUrl),
    thumbnailUrl: normalizeShareAssetUrl(item.thumbnailUrl),
  }
}

function normalizeShareDetail<T extends ShareItem & { shareUrl: string }>(item: T): T {
  return {
    ...normalizeShareItem(item),
    shareUrl: normalizeSharePageUrl(item.shareUrl),
  }
}

function normalizeShareCreate(item: ShareCreateResult): ShareCreateResult {
  return {
    ...normalizeShareDetail(item),
    manageUrl: normalizeSharePageUrl(item.manageUrl),
  }
}

export const shareApi = {
  async create(payload: {
    code: string
    title?: string
    description?: string
    visibility?: ShareVisibility
    thumbnailBase64?: string
  }) {
    const data = await requestJson<ShareCreateResult>('/api/share/maps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return normalizeShareCreate(data)
  },

  suggest(payload: { code: string; hint?: string; prompt?: string }) {
    return requestJson<ShareSuggestResult>('/api/share/maps/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },

  async suggestStream(
    payload: { code: string; hint?: string; prompt?: string },
    options: {
      signal?: AbortSignal
      onDelta: (event: ShareSuggestStreamEvent) => void
    },
  ) {
    const response = await fetch('/api/share/maps/suggest/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: options.signal,
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('无法获取响应流')

    const decoder = new TextDecoder()
    let buffer = ''

    const processLine = (line: string) => {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) return
      const payloadText = trimmed.slice(5).trim()
      if (!payloadText || payloadText === '[DONE]') return

      const event = JSON.parse(payloadText) as ShareSuggestStreamEvent | { type: 'error'; error?: string }
      if (event.type === 'error') {
        throw new Error(event.error || '生成失败')
      }
      options.onDelta(event)
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        processLine(line)
      }
    }

    if (buffer.trim()) {
      processLine(buffer)
    }
  },

  async getDetail(slug: string, options?: { manageToken?: string; track?: boolean }) {
    const query = new URLSearchParams()
    if (options?.manageToken) query.set('manageToken', options.manageToken)
    if (options?.track === false) query.set('track', '0')
    const qs = query.toString()
    const url = `/api/share/maps/${encodeURIComponent(slug)}${qs ? `?${qs}` : ''}`
    const data = await requestJson<ShareItem & { shareUrl: string }>(url)
    return normalizeShareDetail(data)
  },

  async update(slug: string, payload: { manageToken: string; title?: string; description?: string; visibility?: ShareVisibility }) {
    const data = await requestJson<ShareItem & { shareUrl: string }>(`/api/share/maps/${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return normalizeShareDetail(data)
  },

  async remove(slug: string, payload: { manageToken: string }) {
    const data = await requestJson<ShareItem & { shareUrl: string }>(`/api/share/maps/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return normalizeShareDetail(data)
  },

  async listPublic(options?: { page?: number; pageSize?: number }) {
    const query = new URLSearchParams()
    if (options?.page) query.set('page', String(options.page))
    if (options?.pageSize) query.set('pageSize', String(options.pageSize))
    const qs = query.toString()
    const url = `/api/share/public${qs ? `?${qs}` : ''}`
    const data = await requestJson<SharePublicListResult>(url)
    return {
      ...data,
      items: data.items.map((item) => normalizeShareItem(item)),
    }
  },
}
