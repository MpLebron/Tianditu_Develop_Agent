import type { ShareCreateResult, ShareItem, SharePublicListResult, ShareSuggestResult, ShareVisibility } from '../types/share'

interface ApiSuccess<T> {
  success: true
  data: T
}

interface ApiFailure {
  success: false
  error: string
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
